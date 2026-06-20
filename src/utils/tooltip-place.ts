/** Умное размещение тултипов: вверх/вниз и сдвиг по горизонтали, чтобы не выходить за границы. */

const TOOLTIP_GAP = 8;
const TOOLTIP_EDGE_MARGIN = 8;

function updateTooltipPlacement(trigger: HTMLElement): void {
  const tooltip = trigger.querySelector<HTMLElement>('.tooltip');
  if (!tooltip) return;

  const triggerRect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tr = tooltip.getBoundingClientRect();

  // Title names popover — left-aligned, fit content
  if (tooltip.classList.contains('title-info-popover')) {
    const spaceAbove = triggerRect.top;
    const spaceBelow = vh - triggerRect.bottom;
    if (spaceBelow >= spaceAbove) {
      tooltip.classList.add('tooltip--below');
    } else {
      tooltip.classList.remove('tooltip--below');
    }
    tooltip.style.removeProperty('--tooltip-dx');
    return;
  }

  // Для "правых" тултипов (например, сайдбар) не применяем логику above/below + dx
  if (tooltip.classList.contains('tooltip--right')) return;

  // Вертикаль: выбираем сторону с большим свободным пространством
  const tooltipHeight = tr.height || tooltip.offsetHeight || 0;
  const spaceAbove = triggerRect.top;
  const spaceBelow = vh - triggerRect.bottom;
  if (spaceBelow >= spaceAbove) {
    tooltip.classList.add('tooltip--below');
  } else {
    tooltip.classList.remove('tooltip--below');
  }

  // Горизонталь: сдвиг, чтобы не вылезать за левый/правый край (scrollWidth на случай скрытого элемента)
  const tooltipWidth = tr.width || tooltip.offsetWidth || tooltip.scrollWidth || 0;
  if (tooltipWidth > 0) {
    const centerX = triggerRect.left + triggerRect.width / 2;
    const desiredLeft = centerX - tooltipWidth / 2;
    const clampedLeft = Math.max(
      TOOLTIP_EDGE_MARGIN,
      Math.min(desiredLeft, vw - TOOLTIP_EDGE_MARGIN - tooltipWidth)
    );
    const dx = clampedLeft - desiredLeft;
    tooltip.style.setProperty('--tooltip-dx', `${dx}px`);
  } else {
    tooltip.style.removeProperty('--tooltip-dx');
  }
}

function onTooltipTriggerEnter(e: Event): void {
  const trigger = (e.target as Element)?.closest?.('.tooltip-trigger');
  if (trigger instanceof HTMLElement) {
    requestAnimationFrame(() => {
      updateTooltipPlacement(trigger);
      requestAnimationFrame(() => updateTooltipPlacement(trigger));
    });
  }
}

export function initTooltipPlacement(): void {
  document.body.addEventListener('mouseenter', onTooltipTriggerEnter, true);
  document.body.addEventListener('focusin', onTooltipTriggerEnter, true);
}
