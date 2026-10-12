import {
  between,
  collapseProgress,
  collapseStage,
  fadeInOnCollapse,
  fadeOnCollapse,
  isCompactStage,
  isNearListEnd,
} from '../collapse';

describe('collapse interpolation', () => {
  it('maps progress linearly between the expanded and collapsed values', () => {
    expect(between(0, 120, 48)).toBe(120);
    expect(between(1, 120, 48)).toBe(48);
    expect(between(0.5, 120, 48)).toBe(84);
    expect(between(1.1, 0, 10)).toBeCloseTo(11);
  });

  it('fades out over the first half and stays clamped', () => {
    expect(fadeOnCollapse(0)).toBe(1);
    expect(fadeOnCollapse(0.25)).toBe(0.5);
    expect(fadeOnCollapse(0.5)).toBe(0);
    expect(fadeOnCollapse(1)).toBe(0);
    expect(fadeOnCollapse(-0.2)).toBe(1);
  });

  it('fades in over the second half and stays clamped', () => {
    expect(fadeInOnCollapse(0)).toBe(0);
    expect(fadeInOnCollapse(0.5)).toBe(0);
    expect(fadeInOnCollapse(0.75)).toBe(0.5);
    expect(fadeInOnCollapse(1)).toBe(1);
    expect(fadeInOnCollapse(1.2)).toBe(1);
  });

  it('derives clamped progress from the scroll offset only when collapsible', () => {
    expect(collapseProgress(50, 200, true)).toBe(0.25);
    expect(collapseProgress(-30, 200, true)).toBe(0);
    expect(collapseProgress(500, 200, true)).toBe(1);
    expect(collapseProgress(100, 200, false)).toBe(0);
  });
});

describe('collapse stages', () => {
  it('reports settled ends and the compact threshold', () => {
    expect(collapseStage(0)).toBe('expanded');
    expect(collapseStage(0.0005)).toBe('expanded');
    expect(collapseStage(0.3)).toBe('mostlyExpanded');
    expect(collapseStage(0.5)).toBe('mostlyExpanded');
    expect(collapseStage(0.51)).toBe('mostlyCollapsed');
    expect(collapseStage(0.9995)).toBe('collapsed');
  });

  it('treats stages past the threshold as compact', () => {
    expect(isCompactStage('expanded')).toBe(false);
    expect(isCompactStage('mostlyExpanded')).toBe(false);
    expect(isCompactStage('mostlyCollapsed')).toBe(true);
    expect(isCompactStage('collapsed')).toBe(true);
  });
});

describe('isNearListEnd', () => {
  it('is true once the viewport reaches the load-more distance from the end', () => {
    expect(isNearListEnd(1000, 800, 2280, 480)).toBe(true);
    expect(isNearListEnd(999, 800, 2280, 480)).toBe(false);
  });

  it('is false before the viewport is measured', () => {
    expect(isNearListEnd(0, 0, 0, 480)).toBe(false);
  });
});
