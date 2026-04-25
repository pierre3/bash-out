import type { GameObject } from './GameObject';

export interface CollisionResult {
  hit: boolean;
  /** 衝突法線 (正規化済み) */
  nx: number;
  ny: number;
  /** めり込み量 */
  overlap: number;
}

/** 衝突判定で扱う矩形構造（GameObject 以外の透明残像なども渡せるよう構造的型） */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** AABB同士の衝突判定 */
export function checkAABB(a: GameObject, b: GameObject): CollisionResult {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  if (overlapX <= 0 || overlapY <= 0) {
    return { hit: false, nx: 0, ny: 0, overlap: 0 };
  }

  // めり込みが少ない軸で押し戻す
  if (overlapX < overlapY) {
    const nx = (a.x + a.width / 2) < (b.x + b.width / 2) ? -1 : 1;
    return { hit: true, nx, ny: 0, overlap: overlapX };
  } else {
    const ny = (a.y + a.height / 2) < (b.y + b.height / 2) ? -1 : 1;
    return { hit: true, nx: 0, ny, overlap: overlapY };
  }
}

/** 円とAABBの衝突判定 (ボール vs パドル/ブロック/残像) */
export function checkCircleAABB(
  cx: number, cy: number, radius: number,
  rect: Rect
): CollisionResult {
  // 矩形上の最近接点を求める
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));

  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= radius * radius) {
    return { hit: false, nx: 0, ny: 0, overlap: 0 };
  }

  const dist = Math.sqrt(distSq);
  if (dist === 0) {
    // 中心が矩形内にある場合 → 上方向に押し出す
    return { hit: true, nx: 0, ny: -1, overlap: radius };
  }

  return {
    hit: true,
    nx: dx / dist,
    ny: dy / dist,
    overlap: radius - dist,
  };
}
