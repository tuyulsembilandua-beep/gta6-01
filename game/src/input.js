// Solmar Heat — keyboard + mouse input. Tracks held keys, the mouse position
// in screen space, clicks, and edge-triggered "just pressed" keys.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // consumed once per frame by wasPressed()
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  function keyName(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  window.addEventListener('keydown', (e) => {
    const k = keyName(e);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(keyName(e)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });

  return {
    keys,
    mouse,
    isDown(...names) {
      return names.some((n) => keys.has(n));
    },
    wasPressed(...names) {
      return names.some((n) => pressed.has(n));
    },
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
    // For scripted / shot-mode input: pretend a key is held.
    setKey(name, down) {
      if (down) keys.add(name);
      else keys.delete(name);
    },
    setMouse(x, y, down) {
      mouse.x = x;
      mouse.y = y;
      mouse.down = down;
    },
  };
}
