/** Пружина для элементов, которые отпускает палец: продолжает его скорость, слегка перелетает и успокаивается. */

const STIFFNESS = 320;
const DAMPING = 26;
const REST_DISTANCE = 0.001;
const REST_SPEED = 0.01;
const MAX_FRAME_S = 1 / 30;

/** velocity — в единицах значения в секунду. Возвращает функцию остановки. */
export function springTo(
  from: number,
  to: number,
  velocity: number,
  onFrame: (value: number) => void,
): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onFrame(to);
    return () => {};
  }
  let value = from;
  let speed = velocity;
  let last = performance.now();
  let frame = requestAnimationFrame(function step(now) {
    const dt = Math.min((now - last) / 1000, MAX_FRAME_S);
    last = now;
    speed += (STIFFNESS * (to - value) - DAMPING * speed) * dt;
    value += speed * dt;
    if (Math.abs(to - value) < REST_DISTANCE && Math.abs(speed) < REST_SPEED) {
      onFrame(to);
      return;
    }
    onFrame(value);
    frame = requestAnimationFrame(step);
  });
  return () => cancelAnimationFrame(frame);
}
