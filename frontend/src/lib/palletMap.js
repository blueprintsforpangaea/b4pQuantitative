export const PALLET_MAP_DIMENSIONS = { width: 1520, height: 1120 };

export const PALLET_CARD_SIZE = { width: 198, height: 198 };

export const PALLET_MAP_GAP = 20;

export function rectanglesOverlap(left, right) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

export function clampPalletPosition(position) {
  return {
    x: Math.max(0, Math.min(position.x, PALLET_MAP_DIMENSIONS.width - PALLET_CARD_SIZE.width)),
    y: Math.max(0, Math.min(position.y, PALLET_MAP_DIMENSIONS.height - PALLET_CARD_SIZE.height)),
  };
}

export function buildDefaultPalletLayout(palletIds) {
  const columns = 5;
  const layout = {};

  palletIds.forEach((palletId, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    layout[palletId] = {
      x: column * (PALLET_CARD_SIZE.width + PALLET_MAP_GAP),
      y: row * (PALLET_CARD_SIZE.height + PALLET_MAP_GAP),
    };
  });

  return layout;
}

export function mergePalletLayout(existingLayout, palletIds) {
  const defaultLayout = buildDefaultPalletLayout(palletIds);
  const nextLayout = {};

  palletIds.forEach((palletId) => {
    nextLayout[palletId] = clampPalletPosition(existingLayout?.[palletId] || defaultLayout[palletId]);
  });

  return nextLayout;
}

export function canPlacePallet(layout, palletId, nextPosition) {
  const candidateRect = {
    ...nextPosition,
    width: PALLET_CARD_SIZE.width,
    height: PALLET_CARD_SIZE.height,
  };

  return Object.entries(layout).every(([otherPalletId, otherPosition]) => {
    if (otherPalletId === palletId) {
      return true;
    }

    return !rectanglesOverlap(candidateRect, {
      ...otherPosition,
      width: PALLET_CARD_SIZE.width,
      height: PALLET_CARD_SIZE.height,
    });
  });
}
