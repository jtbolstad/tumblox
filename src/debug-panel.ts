import type RAPIER from '@dimforge/rapier3d-compat';

/** Shape of main.ts's tunable `params` object; kept loose so this module doesn't import it back. */
type DebugParams = {
  gravity: number;
  massScale: number;
  radiusScale: number;
  speedTap: number;
  speedLight: number;
  speedMedium: number;
  speedFull: number;
  flickLight: number;
  flickMedium: number;
  flickFull: number;
  upwardBias: number;
  solverIterations: number;
  grabStiffness: number;
  grabDamping: number;
  grabMaxAccel: number;
  restart: () => void;
};

/** Development-only lil-gui panel for live-tuning physics/throw parameters. No-op in production. */
export async function createDebugPanel(world: RAPIER.World, params: DebugParams) {
  const { default: GUI } = await import('lil-gui');
  const gui = new GUI({ title: 'Debug' });
  gui.add(params, 'gravity', 1, 30).onChange((g: number) => (world.gravity = { x: 0, y: -g, z: 0 }));
  gui.add(params, 'massScale', 0.25, 4);
  gui.add(params, 'radiusScale', 0.5, 2);
  const power = gui.addFolder('Power curve (m/s per tier)');
  power.add(params, 'speedTap', 1, 40);
  power.add(params, 'speedLight', 1, 40);
  power.add(params, 'speedMedium', 1, 40);
  power.add(params, 'speedFull', 1, 60);
  const flick = gui.addFolder('Flick thresholds (px/s)');
  flick.add(params, 'flickLight', 100, 4000);
  flick.add(params, 'flickMedium', 500, 8000);
  flick.add(params, 'flickFull', 1000, 15000);
  gui.add(params, 'upwardBias', 0, 0.3);
  const grabGui = gui.addFolder('Grab spring');
  grabGui.add(params, 'grabStiffness', 5, 200);
  grabGui.add(params, 'grabDamping', 1, 40);
  grabGui.add(params, 'grabMaxAccel', 5, 100);
  gui
    .add(params, 'solverIterations', 1, 30, 1)
    .onChange((n: number) => (world.integrationParameters.numSolverIterations = n));
  gui.add(params, 'restart').name('Restart level (R)');
  gui.close();
  document.body.classList.add('dev');
}
