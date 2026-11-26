// Basalt Horizon — input.js
// Keyboard and mouse, the only controls the game needs. Keys are read as a
// live state map so the flight model can ease toward the pilot's command
// instead of snapping to it.

export function createInput(canvas) {
  const keys = {};
  const input = {
    pitchUp: false, pitchDown: false,
    rollLeft: false, rollRight: false,
    throttleUp: false, throttleDown: false,
    // Edge-triggered actions, consumed by the game loop each frame.
    pressed: {},
    mouse: { x: 0, y: 0, clicked: false, clickX: 0, clickY: 0 },
  };

  function updateFromKeys() {
    input.pitchUp = !!(keys.ArrowUp || keys.KeyW);
    input.pitchDown = !!(keys.ArrowDown || keys.KeyS);
    input.rollLeft = !!(keys.ArrowLeft || keys.KeyA);
    input.rollRight = !!(keys.ArrowRight || keys.KeyD);
    input.throttleUp = !!(keys.ShiftLeft || keys.ShiftRight || keys.KeyE);
    input.throttleDown = !!(keys.ControlLeft || keys.ControlRight || keys.KeyQ);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (!keys[e.code]) input.pressed[e.code] = true;
    keys[e.code] = true;
    updateFromKeys();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    updateFromKeys();
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    updateFromKeys();
  });

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouse.x = e.clientX - r.left;
    input.mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouse.clicked = true;
    input.mouse.clickX = e.clientX - r.left;
    input.mouse.clickY = e.clientY - r.top;
  });

  input.endFrame = function () {
    input.pressed = {};
    input.mouse.clicked = false;
  };
  return input;
}
