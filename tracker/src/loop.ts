// The control loop: ties the upstream aircraft feed, the pointing pipeline,
// the calibration session, and the camera driver together, and assembles the
// TrackerState the debug UI renders.
//
// Cadence: aircraft fixes arrive ~1 Hz; the loop ticks at predict.commandHz
// (default 15 Hz). On each fresh fix the alpha-beta setpoint trackers are fed
// an observation; every tick they glide toward it, rate-limited, and the
// (deadbanded) result goes to the camera as an absolute move.

import {
  AxisTracker,
  azElFromSite,
  hfovFromZoomUnits,
  mountFromWorld,
  norm180,
  worldFromMount,
  zoomUnitsFromHfov,
  type Aircraft,
  type AzEl,
  type CalibrationRef,
  type CameraPose,
  type Config,
  type PanTilt,
  type TargetMode,
  type TrackerConfig,
  type TrackerMode,
  type TrackerState,
} from "@shared/index.js";
import type { CameraDriver } from "./camera/driver.js";
import { CalibrationSession } from "./calibration/session.js";
import { planPass, zenithHold, ZENITH_MIN_HFOV } from "./pointing/planner.js";
import { predictAim, TrackHistory, type Prediction } from "./pointing/predict.js";
import { selectTarget, type CurrentTarget } from "./pointing/target.js";
import { chooseZoom } from "./pointing/zoom.js";
import { detectCandidatesInJpeg, type Detection } from "./vision/detect.js";
import type { Recorder } from "./record.js";
import type { Upstream } from "./upstream.js";
import type { VideoStream } from "./video/stream.js";

export class ControlLoop {
  private mode: TrackerMode = "auto";
  private manualHex: string | null = null;
  private current: CurrentTarget | null = null;
  private history = new TrackHistory();
  private azTracker = new AxisTracker(true);
  private elTracker = new AxisTracker(false);
  private lastObservedTs = 0;
  private lastCommanded: CameraPose | null = null;
  /** Last acquisition move sent (dedupe; null while in velocity pursuit). */
  private lastAbsolute: CameraPose | null = null;
  /** A velocity drive is active — must be zeroed if the target vanishes. */
  private pursuing = false;
  /** Idle ready-position state. */
  private lastTargetAt = 0;
  private atHome = false;
  /** Last carrot re-issue time. */
  private lastCarrotAt = 0;
  /** Last commanded velocity rates (direction-flip hysteresis). */
  private lastPanRateCmd = 0;
  private lastTiltRateCmd = 0;
  /** Learned rate deficit (integral term) — the dither's accel transients
   *  make the true average rate run under the commanded one, and P alone
   *  holds a steady error to compensate (= visible trailing). */
  private panRateI = 0;
  private tiltRateI = 0;

  // --- vision (Phase B) ---
  private visionTimer: ReturnType<typeof setInterval> | null = null;
  private visionBusy = false;
  private lastDetection:
    | (Detection & { t: number; frameT: number; offAzDeg: number; offElDeg: number })
    | null = null;
  /** Estimated ADS-B-vs-vision aim bias (blob − prediction), world deg. */
  private corrAz = 0;
  private corrEl = 0;
  /** Since when the detection has been continuously near center (0 = not). */
  private visionGoodSince = 0;
  /** Zoom ladder rung (0 = full wide); climbs as vision lock sustains. */
  private ladderIdx = 0;
  private lastLadderAt = 0;
  /**
   * Recent aim/prediction history so vision can reference the pose AT FRAME
   * TIME — frames lag ~0.7 s, and measuring a blob in an old frame against
   * the CURRENT pose creates a motion ghost that rails the correction.
   */
  private aimHistory: {
    t: number;
    aimAz: number;
    aimEl: number;
    predAz: number;
    predEl: number;
    hfov: number;
  }[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastState: TrackerState | null = null;

  readonly calibration = new CalibrationSession();

  constructor(
    private upstream: Upstream,
    private driver: () => CameraDriver,
    private recorder: Recorder,
    private video: VideoStream,
    private swapDriver: (kind: "sim" | "visca") => void,
    private mseStatus: () => { running: boolean; gen: number } = () => ({
      running: false,
      gen: 0,
    }),
  ) {}

  // --- lifecycle ---

  start(): void {
    if (this.timer) return;
    this.rescheduleTick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.visionTimer) clearInterval(this.visionTimer);
    this.timer = null;
    this.visionTimer = null;
  }

  private rescheduleTick(): void {
    if (this.timer) clearInterval(this.timer);
    const hz = this.cfg().predict.commandHz || 15;
    this.timer = setInterval(() => this.tick(), 1000 / hz);
    if (this.visionTimer) clearInterval(this.visionTimer);
    const ms = this.cfg().vision.intervalMs || 250;
    this.visionTimer = setInterval(() => void this.visionTick(), ms);
  }

  private cfg(): TrackerConfig {
    return this.upstream.getConfig().tracker;
  }

  // --- events from upstream / UI ---

  onSnapshot(now: number, aircraft: Aircraft[]): void {
    for (const ac of aircraft) this.history.observe(ac, now);
    this.history.prune(now);
    this.recorder.write("snapshot", { aircraft });
  }

  onConfig(config: Config): void {
    this.rescheduleTick();
    const t = config.tracker;
    const d = this.driver();
    if (d.kind !== t.driver) this.swapDriver(t.driver);
    // Re-evaluate the idle park: a changed home az/el should move the camera
    // now, not after the next pass.
    this.atHome = false;
  }

  setMode(mode: TrackerMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.manualHex = null;
    this.resetSetpoint();
    this.driver().stopMotion();
    this.recorder.write("mode", { mode });
  }

  getMode(): TrackerMode {
    return this.mode;
  }

  setTargetMode(mode: TargetMode): void {
    this.upstream.patchConfig({ tracker: { targetMode: mode } } as Partial<Config>);
    this.current = null;
    this.resetSetpoint();
  }

  manualTarget(hex: string | null): void {
    this.manualHex = hex;
    this.current = hex ? { hex, sinceMs: Date.now() } : null;
    this.resetSetpoint();
    this.recorder.write("manualTarget", { hex });
  }

  jog(pan: number, tilt: number, zoom: number): void {
    if (this.mode === "auto") this.setMode("manual");
    this.driver().jog(pan, tilt, zoom);
    this.recorder.write("jog", { pan, tilt, zoom });
  }

  stopJog(): void {
    this.driver().stopMotion();
  }

  /** Point at a world direction through the mount model (calibration verify). */
  gotoAzEl(azDeg: number, elDeg: number): void {
    if (this.mode === "auto") this.setMode("manual");
    const cfg = this.cfg();
    const pt = mountFromWorld(azDeg, elDeg, cfg.mount);
    const zoom = this.driver().getPose()?.zoomUnits ?? cfg.units.zoomWideUnits;
    const pose = { ...pt, zoomUnits: zoom };
    this.lastCommanded = pose;
    this.driver().gotoAbsolute(pose);
    this.recorder.write("gotoAzEl", { azDeg, elDeg, pose });
  }

  /** Raw mechanical move (units-per-degree measurement). */
  gotoPanTilt(panDeg: number, tiltDeg: number, zoomUnits?: number): void {
    if (this.mode === "auto") this.setMode("manual");
    const pose = {
      panDeg,
      tiltDeg,
      zoomUnits: zoomUnits ?? this.driver().getPose()?.zoomUnits ?? 0,
    };
    this.lastCommanded = pose;
    this.driver().gotoAbsolute(pose);
    this.recorder.write("gotoPanTilt", { pose });
  }

  calibCapture(ref: CalibrationRef): void {
    const pose = this.driver().getPose();
    if (!pose) return;
    const cfg = this.cfg();
    const cap = this.calibration.capture(
      ref,
      pose,
      cfg.site,
      (hex) => this.upstream.find(hex),
      Date.now(),
    );
    this.recorder.write("calibCapture", { ref, pose, cap });
  }

  calibSolve(solveGains: boolean, solveLevel: boolean): void {
    const model = this.calibration.solve(this.cfg().mount, solveGains, solveLevel);
    this.recorder.write("calibSolve", { model });
  }

  calibApply(): void {
    const model = this.calibration.takeSolved();
    if (!model) return;
    this.upstream.patchConfig({ tracker: { mount: model } } as Partial<Config>);
    this.recorder.write("calibApply", { model });
  }

  // --- the tick ---

  private resetSetpoint(): void {
    this.azTracker.reset();
    this.elTracker.reset();
    this.lastObservedTs = 0;
    // Vision state is target-specific — a stale lock or correction from the
    // previous plane must not smear onto the new one.
    this.lastDetection = null;
    this.corrAz = 0;
    this.corrEl = 0;
    this.visionGoodSince = 0;
    this.ladderIdx = 0;
    this.lastLadderAt = 0;
    this.panRateI = 0;
    this.tiltRateI = 0;
  }

  private tick(): void {
    const now = Date.now();
    const cfg = this.cfg();
    const d = this.driver();
    const pose = d.getPose();
    // Dead-reckoned current pose: position replies stall around drives, so
    // the raw pose can lag by seconds mid-pursuit — closing the loop on it
    // injects phase lag that reads as trailing/hunting. All error terms and
    // slew estimates use this; the raw pose is kept for state/recording.
    const poseEst = d.getPoseEstimate() ?? pose;

    let prediction: Prediction | null = null;
    let targetAc: Aircraft | undefined;
    let commandedPanTilt: PanTilt | null = null;
    let hfovDeg: number | null = null;
    let angular: number | null = null;

    // Target selection runs in auto mode, or pinned in manual-target mode.
    const tracking =
      this.mode === "auto" || (this.mode === "manual" && this.manualHex != null);

    const selection = selectTarget(
      this.upstream.getAircraft(),
      cfg.site,
      now,
      this.current,
      cfg.targetMode,
      cfg.target,
    );

    if (tracking) {
      const hex = this.manualHex ?? selection.hex;
      if (hex !== this.current?.hex) {
        this.current = hex ? { hex, sinceMs: now } : null;
        this.resetSetpoint();
        this.recorder.write("target", { hex });
      }
      targetAc = hex ? this.upstream.find(hex) : undefined;
      // A manually-pinned target may be outside the candidate filter — allow it.
      if (this.manualHex && !targetAc) this.current = null;
    }

    if (tracking && targetAc) {
      prediction = predictAim(
        targetAc,
        cfg.site,
        now,
        this.history,
        cfg.predict,
        cfg.mount,
        cfg.limits,
        poseEst ? { panDeg: poseEst.panDeg, tiltDeg: poseEst.tiltDeg } : null,
      );
    }

    if (prediction && targetAc) {
      // Trajectory plan: detects near-zenith passes where chasing azimuth
      // would exceed the pan rate — pre-rotates to the exit side instead.
      const plan = planPass(targetAc, cfg.site, now);
      const hold = zenithHold(plan, prediction.azEl.elDeg);

      let az: number;
      let el: number;
      if (hold) {
        // Park on the exit azimuth, tilt just under vertical, fly-through.
        az = hold.azDeg;
        el = hold.elDeg;
        this.azTracker.reset(az);
        this.elTracker.reset(el);
        this.lastObservedTs = 0; // re-seed the filters on regime exit
        // The crossing reverses the needed pan rate — an inbound-learned
        // rate deficit is wrong-signed outbound.
        this.panRateI = 0;
        this.tiltRateI = 0;
      } else {
        // Feed the alpha-beta trackers on each fresh fix.
        const fixTs = targetAc.ts ?? now;
        if (fixTs !== this.lastObservedTs) {
          const dtFix = this.lastObservedTs ? (fixTs - this.lastObservedTs) / 1000 : 1;
          this.azTracker.observe(prediction.azEl.azDeg, dtFix, prediction.azRateDps);
          this.elTracker.observe(prediction.azEl.elDeg, dtFix, prediction.elRateDps);
          this.lastObservedTs = fixTs;
        }
        const dt = 1 / (cfg.predict.commandHz || 15);
        az = this.azTracker.propagate(dt, cfg.limits.panSpeedMaxDps);
        el = this.elTracker.propagate(dt, cfg.limits.tiltSpeedMaxDps);
        // Vision steering (Phase B): slow integral correction from the
        // detector, nudging the ADS-B aim onto the actual pixels.
        if (cfg.vision.applyCorrection) {
          az += this.corrAz;
          el = Math.min(90, Math.max(0, el + this.corrEl));
        }
      }

      const pt = mountFromWorld(az, el, cfg.mount);
      // Target's angular rate across the sky (for the zoom-out floor).
      const rateDps = Math.hypot(
        this.azTracker.rate * Math.cos((el * Math.PI) / 180),
        this.elTracker.rate,
      );
      // How far the camera is trailing its command right now, deg.
      const lagDeg = poseEst
        ? Math.hypot(
            norm180(poseEst.panDeg - pt.panDeg) * Math.cos((el * Math.PI) / 180),
            poseEst.tiltDeg - pt.tiltDeg,
          )
        : 0;
      const zoom = chooseZoom(targetAc, prediction.azEl, cfg, rateDps, lagDeg);
      if (hold && zoom.hfovDeg < ZENITH_MIN_HFOV) {
        // Wide through the crossing so the fly-through stays framed.
        zoom.hfovDeg = ZENITH_MIN_HFOV;
        zoom.zoomUnits = zoomUnitsFromHfov(ZENITH_MIN_HFOV, cfg.zoom.fovLut);
      }
      if (cfg.vision.lockWide) {
        // Vision-gated zoom LADDER: start fully wide; each time the detector
        // holds the plane near center for a while, step one rung tighter
        // (toward the ADS-B-chosen framing). Step back out when the lock
        // degrades; snap to wide when it's lost. Stepping (instead of the
        // old wide<->tight jump) keeps the plane in frame through every
        // transition — a rung is only granted after the PREVIOUS rung held.
        const wideHfov = hfovFromZoomUnits(cfg.units.zoomWideUnits, cfg.zoom.fovLut);
        const RUNG = 0.62; // hfov ratio per rung
        const detFresh =
          this.lastDetection && now - this.lastDetection.t < 1200;
        const locked =
          cfg.vision.applyCorrection &&
          this.visionGoodSince > 0 &&
          now - this.visionGoodSince > 1500;
        if (!detFresh && this.lastDetection == null) {
          this.ladderIdx = 0; // lost entirely -> reacquire wide
        } else if (locked && detFresh && now - this.lastLadderAt > 1500) {
          this.ladderIdx++;
          this.lastLadderAt = now;
          this.visionGoodSince = 0; // earn the next rung from scratch
        } else if (
          this.ladderIdx > 0 &&
          this.visionGoodSince === 0 &&
          now - this.lastLadderAt > 2000
        ) {
          this.ladderIdx--; // lock degrading -> widen one rung
          this.lastLadderAt = now;
        }
        const ladderHfov = wideHfov * Math.pow(RUNG, this.ladderIdx);
        if (ladderHfov > zoom.hfovDeg) {
          zoom.hfovDeg = ladderHfov;
          zoom.zoomUnits = zoomUnitsFromHfov(ladderHfov, cfg.zoom.fovLut);
        } else {
          // Ladder has reached the ADS-B framing — clamp the rung so a later
          // demotion starts from here, not from rungs banked beyond it.
          this.ladderIdx = Math.max(
            0,
            Math.round(Math.log(zoom.hfovDeg / wideHfov) / Math.log(RUNG)),
          );
        }
      }
      hfovDeg = zoom.hfovDeg;
      angular = zoom.angularSizeDeg;
      commandedPanTilt = pt;

      // A long lens on open sky gives autofocus nothing to lock onto — it
      // hunts and blurs the plane into nothing (and the detector loses it).
      // Pin manual focus at the far stop once meaningfully zoomed; hand back
      // to autofocus at wide, where hyperfocal depth covers everything.
      d.setFocusInfinity(zoom.hfovDeg < 30);

      const cmd: CameraPose = { ...pt, zoomUnits: zoom.zoomUnits };
      this.lastCommanded = cmd;

      // Two regimes:
      //  - ACQUIRE: far off target -> one absolute move at full speed.
      //  - PURSUE: near target -> continuous velocity drive (feedforward
      //    setpoint rate + P-correction). Streamed absolute moves each run
      //    at max speed and hard-stop, which is what made motion choppy.
      const errPan = poseEst ? norm180(pt.panDeg - poseEst.panDeg) : Infinity;
      const errTilt = poseEst ? pt.tiltDeg - poseEst.tiltDeg : Infinity;
      const farOff = Math.max(Math.abs(errPan), Math.abs(errTilt)) > 10;
      // Shortest-path velocity drive can pin against the ±175° stop when the
      // goal lies across the pan dead-zone — those slews (and the zenith
      // park) genuinely need an absolute move, which the camera routes
      // within its encoder range. The exact test: if pose+err does NOT land
      // on the goal, the shortest path wraps through the zone (observed:
      // pose −175°, goal −140° "via" −214° → pinned 35° behind for a full
      // minute). Everything else, including catch-up after falling behind,
      // goes through the velocity drive: its P-term saturates at the top
      // speed step with NO accel-ramp restarts (streamed absolutes re-ramp
      // on every re-issue and crawl — observed ballooning 9°→105° of error
      // right at a pass peak).
      const pathBlocked =
        poseEst != null && Math.abs(poseEst.panDeg + errPan - pt.panDeg) > 1;
      const wrapAround = Math.abs(errPan) > 90;
      const useAbsolute =
        !pose ||
        hold ||
        pathBlocked ||
        (farOff && (wrapAround || cfg.predict.pursuit !== "velocity"));

      if (useAbsolute) {
        if (
          !this.lastAbsolute ||
          Math.abs(norm180(cmd.panDeg - this.lastAbsolute.panDeg)) > 1 ||
          Math.abs(cmd.tiltDeg - this.lastAbsolute.tiltDeg) > 1
        ) {
          this.lastAbsolute = cmd;
          d.gotoAbsolute(cmd);
          this.recorder.write("command", { cmd, predicted: prediction.azEl, mode: "acquire" });
        }
      } else if (cfg.predict.pursuit === "velocity") {
        this.lastAbsolute = null;
        // Setpoint rates live in world az/el; mount rates differ by the gains.
        // PI on the pose error: P pulls toward the setpoint, I learns the
        // systematic rate deficit (dither accel transients) so the camera
        // CENTERS the plane instead of trailing it by a held error.
        const KP = 1.5; // 1/s
        const KI = 0.6; // 1/s² — converges in ~2-3 s, anti-windup below
        const dtTick = 1 / (cfg.predict.commandHz || 15);
        this.panRateI = clamp(this.panRateI + KI * errPan * dtTick, -6, 6);
        this.tiltRateI = clamp(this.tiltRateI + KI * errTilt * dtTick, -6, 6);
        let panRate =
          this.azTracker.rate / cfg.mount.panGain + KP * errPan + this.panRateI;
        let tiltRate =
          this.elTracker.rate / cfg.mount.tiltGain + KP * errTilt + this.tiltRateI;
        // Deadband so the camera rests when locked on (frame-relative: what
        // counts as "centered" is a fraction of the field of view, not a
        // fixed angle). The driver dithers against stop below the table
        // floor, so slow rates ARE commandable — only near-still targets
        // should rest.
        const dead = Math.max(0.15, (hfovDeg ?? 56) * 0.015);
        if (Math.abs(errPan) < dead && Math.abs(panRate) < 0.4) panRate = 0;
        if (Math.abs(errTilt) < dead && Math.abs(tiltRate) < 0.4) tiltRate = 0;
        // Direction-flip hysteresis: micro sign-flips (vision-correction
        // jitter at tele) command alternating bursts of the camera's MINIMUM
        // step — visible left-right rocking. Rest instead of reversing until
        // the rate is clearly real.
        if (
          this.lastPanRateCmd !== 0 &&
          Math.sign(panRate) === -Math.sign(this.lastPanRateCmd) &&
          Math.abs(panRate) < 0.8
        ) {
          panRate = 0;
        }
        if (
          this.lastTiltRateCmd !== 0 &&
          Math.sign(tiltRate) === -Math.sign(this.lastTiltRateCmd) &&
          Math.abs(tiltRate) < 0.8
        ) {
          tiltRate = 0;
        }
        // Anti-windup: while resting (deadband/hysteresis), bleed the
        // integrator instead of accumulating against a motionless camera.
        if (panRate === 0) this.panRateI *= 0.9;
        if (tiltRate === 0) this.tiltRateI *= 0.9;
        this.lastPanRateCmd = panRate;
        this.lastTiltRateCmd = tiltRate;
        d.trackRate(panRate, tiltRate);
        this.pursuing = panRate !== 0 || tiltRate !== 0;
        d.setZoom(zoom.zoomUnits);
        this.recorder.write("command", {
          panRate, tiltRate, errPan, errTilt, zoom: zoom.zoomUnits, mode: "pursue",
        });
      } else if (poseEst && now - this.lastCarrotAt >= cfg.predict.carrotMs) {
        // CARROT pursuit: command a goal ~horizon seconds ahead along the
        // smoothed track, at a speed matched to arrive exactly then — and
        // re-issue before arrival, so the camera glides without ever
        // decelerating or hunting between coarse speed steps.
        this.lastCarrotAt = now;
        this.lastAbsolute = null;
        this.pursuing = false;
        const h = cfg.predict.carrotHorizonSec;
        const azAhead = az + this.azTracker.rate * h;
        const elAhead = Math.min(90, Math.max(0, el + this.elTracker.rate * h));
        const ptAhead = mountFromWorld(azAhead, elAhead, cfg.mount);
        const panDps = Math.abs(norm180(ptAhead.panDeg - poseEst.panDeg)) / h;
        const tiltDps = Math.abs(ptAhead.tiltDeg - poseEst.tiltDeg) / h;
        d.gotoAbsolute(
          { ...ptAhead, zoomUnits: zoom.zoomUnits },
          { panDps, tiltDps },
        );
        this.recorder.write("command", {
          ptAhead, panDps, tiltDps, errPan, errTilt, mode: "carrot",
        });
      }
    }

    // Target vanished while a velocity drive was active -> stop the motors,
    // or the camera glides into its mechanical limit on the last command.
    if (!prediction && this.pursuing) {
      this.driver().trackRate(0, 0);
      this.pursuing = false;
    }

    // No target for a while in auto mode -> park at the ready position
    // (default: 15° tilt along the bearing toward SFO, full wide), so the
    // next departure climbs straight into frame.
    if (prediction) {
      this.lastTargetAt = now;
      this.atHome = false;
    } else if (
      this.mode === "auto" &&
      cfg.home.enabled &&
      !this.atHome &&
      now - this.lastTargetAt > cfg.home.afterSec * 1000
    ) {
      const azDeg =
        cfg.home.mode === "sfo"
          ? azElFromSite(cfg.site, { ...SFO_ARP, altM: cfg.site.altM }).azDeg
          : cfg.home.azDeg;
      const pt = mountFromWorld(azDeg, cfg.home.elDeg, cfg.mount);
      this.atHome = true;
      this.lastAbsolute = null;
      this.driver().gotoAbsolute({ ...pt, zoomUnits: cfg.units.zoomWideUnits });
      this.driver().setFocusInfinity(false); // wide + idle -> autofocus
      this.recorder.write("home", { azDeg, elDeg: cfg.home.elDeg });
    }

    // Aim/prediction history for frame-lag-compensated vision. Entries are
    // timestamped `now`, so the dead-reckoned pose is the right aim here.
    if (poseEst && prediction) {
      const aim = worldFromMount(poseEst, cfg.mount);
      this.aimHistory.push({
        t: now,
        aimAz: aim.azDeg,
        aimEl: aim.elDeg,
        predAz: prediction.azEl.azDeg,
        predEl: prediction.azEl.elDeg,
        hfov: hfovFromZoomUnits(poseEst.zoomUnits, cfg.zoom.fovLut),
      });
      if (this.aimHistory.length > 150) this.aimHistory.shift();
    } else if (!prediction) {
      this.aimHistory.length = 0;
    }

    this.lastState = this.assembleState(
      now, cfg, pose, selection.candidates, targetAc, prediction,
      commandedPanTilt, hfovDeg, angular,
    );
    this.recorder.write("pose", { pose });
  }

  private assembleState(
    now: number,
    cfg: TrackerConfig,
    pose: CameraPose | null,
    candidates: TrackerState["candidates"],
    targetAc: Aircraft | undefined,
    prediction: Prediction | null,
    commandedPanTilt: PanTilt | null,
    hfovDeg: number | null,
    angularSizeDeg: number | null,
  ): TrackerState {
    return {
      now,
      mode: this.mode,
      targetMode: cfg.targetMode,
      driver: this.driver().diagnostics(),
      pose,
      commanded: this.lastCommanded,
      target: {
        hex: this.current?.hex ?? null,
        flight: targetAc?.flight,
        predicted: prediction?.azEl ?? null,
        commandedPanTilt,
        leadSec: prediction?.leadSec ?? 0,
        hfovDeg,
        angularSizeDeg,
      },
      candidates,
      calibration: this.calibration.state(cfg.site, now),
      recording: this.recorder.recording,
      video: {
        ...this.video.status(),
        mseRunning: this.mseStatus().running,
        mseGen: this.mseStatus().gen,
      },
      vision: {
        enabled: cfg.vision.enabled,
        applying: cfg.vision.applyCorrection,
        lockWide: cfg.vision.lockWide,
        detection: this.lastDetection
          ? {
              cx: this.lastDetection.cx,
              cy: this.lastDetection.cy,
              boxX: this.lastDetection.box.x,
              boxY: this.lastDetection.box.y,
              boxW: this.lastDetection.box.w,
              boxH: this.lastDetection.box.h,
              contrastSigma: this.lastDetection.contrastSigma,
              offAzDeg: this.lastDetection.offAzDeg,
              offElDeg: this.lastDetection.offElDeg,
              ageMs: now - this.lastDetection.t,
            }
          : null,
        correctionAzDeg: this.corrAz,
        correctionElDeg: this.corrEl,
      },
      site: cfg.site,
      upstream: {
        connected: this.upstream.isConnected(),
        aircraftCount: this.upstream.getAircraft().length,
      },
    };
  }

  /** Aim/prediction history entry nearest a timestamp. */
  private aimAt(t: number): (typeof this.aimHistory)[number] | undefined {
    let best: (typeof this.aimHistory)[number] | undefined;
    for (const h of this.aimHistory) {
      if (!best || Math.abs(h.t - t) < Math.abs(best.t - t)) best = h;
    }
    return best;
  }

  /**
   * Vision pass (Phase B v2): find the plane in the latest frame near the
   * motion-compensated expectation, and update the ADS-B bias estimate.
   * Everything is referenced to FRAME TIME via per-frame arrival timestamps.
   */
  private async visionTick(): Promise<void> {
    const cfg = this.cfg();
    const tracking =
      (this.mode === "auto" || this.mode === "manual") && this.current !== null;
    if (!cfg.vision.enabled || !tracking) {
      this.lastDetection = null;
      this.corrAz = 0;
      this.corrEl = 0;
      return;
    }
    if (this.visionBusy) return;
    const frame = this.video.latestFrame();
    // Captured WITH the frame — by the time the detector finishes, a newer
    // frame may have arrived and overwritten the stream's timestamp.
    const frameArrivedAt = this.video.latestFrameAt();
    const pose = this.driver().getPose();
    if (!frame || !pose || !this.video.status().running) return;

    const hfov = hfovFromZoomUnits(pose.zoomUnits, cfg.zoom.fovLut);
    const vfov = hfov * (9 / 16);
    const aim = worldFromMount(pose, cfg.mount);
    const predicted = this.lastState?.target.predicted ?? null;

    // Frame-time reference: the camera and the plane both moved while this
    // frame crossed the RTSP/MJPEG pipeline. Arrival is timestamped exactly;
    // encodeLagMs covers the residual (exposure -> encode -> RTSP -> decode).
    const preT = Date.now();
    const frameT = (frameArrivedAt > 0 ? frameArrivedAt : preT) - cfg.vision.encodeLagMs;
    const sign = Math.sign(cfg.mount.panGain) || 1;

    // Where should the plane be in THIS frame? Prefer where we LAST SAW it
    // (temporal stickiness — clouds offer competing blobs), advanced by how
    // much the aim-vs-prediction geometry shifted between the two frame
    // times (motion compensation: a tight leash on a moving camera must
    // move with it or it strangles the lock). Fall back to ADS-B.
    let exX = 0.5;
    let exY = 0.5;
    const prevFresh =
      this.lastDetection && preT - this.lastDetection.t < 1500
        ? this.lastDetection
        : null;
    if (prevFresh) {
      exX = prevFresh.cx;
      exY = prevFresh.cy;
      const h1 = this.aimAt(prevFresh.frameT);
      const h2 = this.aimAt(frameT);
      if (h1 && h2) {
        // The zoom LADDER changes hfov between frames — the same world
        // offset lands further from center in a tighter frame. Rescale the
        // previous blob position by the fov ratio or every rung change
        // breaks the temporal chain (observed as snap-to-wide resets).
        const zScale = h1.hfov / Math.max(0.5, h2.hfov);
        exX = 0.5 + (exX - 0.5) * zScale;
        exY = 0.5 + (exY - 0.5) * zScale;
        const hfovRef = h2.hfov;
        const cosEl = Math.max(0.2, Math.cos((h2.aimEl * Math.PI) / 180));
        const dOffAz = norm180(
          norm180(h2.predAz - h2.aimAz) - norm180(h1.predAz - h1.aimAz),
        );
        const dOffEl = (h2.predEl - h2.aimEl) - (h1.predEl - h1.aimEl);
        exX = Math.min(1, Math.max(0, exX + (dOffAz * cosEl * sign) / hfovRef));
        exY = Math.min(1, Math.max(0, exY - dOffEl / (hfovRef * (9 / 16))));
      }
    } else if (predicted) {
      const dAz =
        norm180(predicted.azDeg - aim.azDeg) *
        Math.cos((predicted.elDeg * Math.PI) / 180);
      exX = Math.min(1, Math.max(0, 0.5 + dAz / hfov));
      exY = Math.min(1, Math.max(0, 0.5 - (predicted.elDeg - aim.elDeg) / vfov));
    }

    // Tight-follow at native resolution: a distant plane is 3-6 px on the
    // full-frame downscale; cropping the search to an ROI around the
    // expectation keeps detector pixels ~native (≈2.7× finer at 720p).
    // Zoomed in, the plane is big and may overflow a crop — stay full-frame.
    const wide = hfov > 25;
    const useRoi = prevFresh != null && wide;
    const roi = useRoi
      ? { x: exX - 0.1875, y: exY - 0.1875, w: 0.375, h: 0.375 }
      : undefined;

    this.visionBusy = true;
    try {
      const cands = await detectCandidatesInJpeg(
        frame,
        {
          expectedX: exX,
          expectedY: exY,
          // Tight leash while following a blob; wider when reacquiring.
          maxDistFrac: prevFresh ? 0.15 : 0.3,
          // Sky-mask only while wide; zoomed in, the frame IS sky and a big
          // plane would mask itself.
          useMask: wide,
          // Area limits live in detector px — ~7× finer in ROI mode.
          minArea: useRoi ? 2 : 1,
          maxArea: useRoi ? 4000 : wide ? 600 : 5000,
        },
        roi,
      );
      const now = Date.now();

      // While following a blob, prefer the candidate CONSISTENT with the
      // motion-compensated expectation over the raw best: a cloud edge that
      // pops up brighter elsewhere loses to the blob that moved like the
      // plane. A clearly-stronger far blob still wins (vision glitch).
      let det: Detection | null = null;
      if (prevFresh) {
        det = cands.find((c) => Math.hypot(c.cx - exX, c.cy - exY) < 0.1) ?? null;
        if (!det && cands[0] && cands[0].contrastSigma > prevFresh.contrastSigma * 1.5) {
          det = cands[0];
        }
      } else {
        det = cands[0] ?? null;
      }

      // The zoom gate is updated below on the LAG-COMPENSATED residual; a
      // long detection drought closes it.
      if (!det && this.lastDetection && now - this.lastDetection.t > 1200) {
        this.visionGoodSince = 0;
      }
      if (det) {
        const atFrame = this.aimAt(frameT);
        const latest = this.aimHistory[this.aimHistory.length - 1];

        // Blob offset from frame center -> world angles, at frame time.
        // Image-right is the +pan direction; az sign follows the pan gain.
        const hfovF = atFrame?.hfov ?? hfov;
        const elF = atFrame?.aimEl ?? aim.elDeg;
        const offAzDeg =
          ((det.cx - 0.5) * hfovF * sign) /
          Math.max(0.2, Math.cos((elF * Math.PI) / 180));
        const offElDeg = (0.5 - det.cy) * hfovF * (9 / 16);
        this.lastDetection = { ...det, t: now, frameT, offAzDeg, offElDeg };

        // Temporal confirmation: integrate correction only when the blob
        // repeats where the compensated expectation put it — a one-frame
        // wonder steers nothing.
        const confirmed =
          prevFresh != null && Math.hypot(det.cx - exX, det.cy - exY) < 0.06;

        // Slew gate: a frame exposed while the camera swept fast cannot be
        // lag-compensated precisely (±150 ms of frame-time error at 60°/s is
        // ±9° of phantom bias — observed railing the estimator right after
        // acquisition). Only integrate when the aim was quasi-static around
        // frame time, and below the zenith's 1/cos(el) blow-up.
        const nb = this.aimHistory.filter((h) => Math.abs(h.t - frameT) < 250);
        let aimRateDps = Infinity;
        if (nb.length >= 2) {
          const a0 = nb[0];
          const a1 = nb[nb.length - 1];
          const dt = Math.max(0.05, (a1.t - a0.t) / 1000);
          aimRateDps = Math.hypot(
            norm180(a1.aimAz - a0.aimAz) * Math.cos((a1.aimEl * Math.PI) / 180),
            a1.aimEl - a0.aimEl,
          ) / dt;
        }
        const steady = aimRateDps < 8 && elF < 75;

        if (confirmed && cfg.vision.applyCorrection && atFrame && latest) {
          // Where the blob (the plane, then) is NOW, world frame:
          //   blob@frame + plane's own predicted motion since the frame.
          const blobNowAz =
            atFrame.aimAz + offAzDeg + norm180(latest.predAz - atFrame.predAz);
          const blobNowEl =
            atFrame.aimEl + offElDeg + (latest.predEl - atFrame.predEl);
          // Residual still to close, vs the CURRENT aim (zoom gate below).
          const residAz = norm180(blobNowAz - latest.aimAz);
          const residEl = blobNowEl - latest.aimEl;
          // Correction = the ADS-B bias the detector reveals: where vision
          // says the plane is MINUS where the prediction says it is. This is
          // a direct estimate of an exogenous offset — unlike integrating the
          // pointing residual, it has no feedback path through the camera's
          // ~1 s frame+actuation delay, so it cannot wind up or oscillate
          // (the old integral railed at the ±4° clamp in the field). Only
          // integrate when quasi-static (the slew gate) — but the ZOOM gate
          // below must keep updating regardless, or the ladder demotes on a
          // perfectly-held lock just because the camera is sweeping.
          if (steady) {
            const biasAz = norm180(blobNowAz - latest.predAz);
            const biasEl = blobNowEl - latest.predEl;
            // Estimator blend per confirmed detection. Gentler when zoomed:
            // the bias barely changes once locked, and chasing measurement
            // jitter at 4 Hz reads as rocking when the FOV is a few degrees.
            const G = hfovF < 15 ? 0.15 : 0.35;
            // ±6°: real cross-track ADS-B bias has been observed saturating
            // a ±4° clamp (the estimator was healthy — the plane genuinely
            // was that far from the prediction). The false-lock safeguards
            // (slew gate, motion leash, confirmation) bound the risk now.
            this.corrAz = clamp(this.corrAz + G * norm180(biasAz - this.corrAz), -6, 6);
            this.corrEl = clamp(this.corrEl + G * (biasEl - this.corrEl), -6, 6);
          }
          // Zoom gate: "near center" judged on the lag-compensated residual.
          const residFrac =
            Math.hypot(residAz * Math.cos((elF * Math.PI) / 180), residEl) /
            (hfovF / 2);
          if (residFrac < 0.35) {
            if (!this.visionGoodSince) this.visionGoodSince = now;
          } else if (residFrac > 0.6) {
            this.visionGoodSince = 0;
          }
          this.recorder.write("vision", {
            det, offAzDeg, offElDeg, residAz, residEl, steady,
            corrAz: this.corrAz, corrEl: this.corrEl,
          });
        } else {
          this.recorder.write("vision", { det, offAzDeg, offElDeg });
        }
      } else {
        // No detection: let the correction bleed away.
        this.corrAz *= 0.85;
        this.corrEl *= 0.85;
        if (this.lastDetection && now - this.lastDetection.t > 3000) {
          this.lastDetection = null;
        }
      }
    } catch (err) {
      this.recorder.write("visionError", { err: String(err) });
    } finally {
      this.visionBusy = false;
    }
  }

  getState(): TrackerState | null {
    return this.lastState;
  }

  /** Where the camera is actually looking in the world (for the UI overlay). */
  cameraWorldAim(): AzEl | null {
    const pose = this.driver().getPose();
    if (!pose) return null;
    const cfg = this.cfg();
    const w = worldFromMount(pose, cfg.mount);
    return { ...w, slantM: 0 };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** SFO airport reference point (the project's anchor airport). */
const SFO_ARP = { lat: 37.6213, lon: -122.379 };
