/**
 * The classroom seating plan (pure logic, no three.js). Two rows of three desks. You start in the back-middle
 * (home) seat. A seat draw moves you and your desk stuff to the drawn seat, and the classmates shuffle like this:
 *   1. if the seat is in the front row, your whole row swaps places with the front row
 *   2. then, inside your row, you swap with whoever sits in the drawn column
 * So a corner seat has one classmate next to you instead of two.
 *
 * Coordinates are room coordinates (the room never moves; the player's rig is the one that is "somewhere else").
 */
export const COL_X: readonly number[] = [-1.3, 0, 1.3];
/** desk z per row: 0 = front row (nearer the board), 1 = back row (home) */
export const ROW_Z: readonly number[] = [-2.2, -0.55];
/** how far behind its desk a classmate sits, per row */
export const SIT_BEHIND: readonly number[] = [0.7, 0.7];
export const HOME_ROW = 1;
export const HOME_COL = 1;
/** the aisles the teacher walks run at x = +-AISLE_X, between the columns */
export const AISLE_X = 0.65;
const HOME_STAND_Z = -0.35; // where she stands beside a back-row desk

export interface Slot {
  row: number;
  col: number;
}

export interface Arrangement {
  /** the player's seat */
  row: number;
  col: number;
  /** where each classmate (index 0..4) sits */
  kids: Slot[];
  /** classmate index next to you on the left / right, or -1 when that seat is empty */
  adjacent: [number, number];
}

/** start-of-day classmates: 0 = back-left, 1 = back-right, 2..4 = the front row left to right */
const HOME_KIDS: readonly Slot[] = [
  { row: 1, col: 0 },
  { row: 1, col: 2 },
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 0, col: 2 },
];

export function arrange(row: number, col: number): Arrangement {
  // occ[r][c] = -1 for the player, else a classmate index
  const occ: number[][] = [[], []];
  occ[HOME_ROW][HOME_COL] = -1;
  HOME_KIDS.forEach((s, i) => {
    occ[s.row][s.col] = i;
  });
  if (row !== HOME_ROW) {
    const t = occ[0];
    occ[0] = occ[1];
    occ[1] = t;
  }
  // the player's row is now `row`, and the player is still in column 1
  if (col !== HOME_COL) {
    const other = occ[row][col];
    occ[row][col] = -1;
    occ[row][HOME_COL] = other;
  }
  const kids: Slot[] = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const who = occ[r][c];
      if (who >= 0) kids[who] = { row: r, col: c };
    }
  }
  return {
    row,
    col,
    kids,
    adjacent: [col > 0 ? occ[row][col - 1] : -1, col < 2 ? occ[row][col + 1] : -1],
  };
}

/** the live seat: read by the classroom, the teacher and the fruit system */
export const SEATING = {
  row: HOME_ROW,
  col: HOME_COL,
  /** how far your desk is from the home desk, in room coordinates */
  dx: 0,
  dz: 0,
  /** bumps whenever you move */
  seq: 0,
  /** where she stands when she comes to check you: the aisle toward the room's middle, beside your desk */
  standZ: HOME_STAND_Z,
  /** shared with the patrol waypoints: the floor point she looks at when she checks on you */
  look: [0, 0.05] as [number, number],
  arrangement: arrange(HOME_ROW, HOME_COL),
  set(row: number, col: number): Arrangement {
    this.row = row;
    this.col = col;
    this.dx = COL_X[col] - COL_X[HOME_COL];
    this.dz = ROW_Z[row] - ROW_Z[HOME_ROW];
    this.standZ = ROW_Z[row] + 0.2;
    this.look[0] = this.dx;
    this.look[1] = this.dz + 0.05;
    this.arrangement = arrange(row, col);
    this.seq += 1;
    return this.arrangement;
  },
  /** the aisle she uses to reach your desk: the corner seats have only one aisle next to them */
  aisleX(sideHint: 1 | -1): number {
    if (this.col === 0) return -AISLE_X;
    if (this.col === 2) return AISLE_X;
    return sideHint * AISLE_X;
  },
};

/**
 * Height comfort: the room follows your real head height so it fits sitting or standing. It adapts quickly in the
 * menus and very slowly during an exam (so leaning over to the tray does not bob the room).
 */
export const COMFORT = { menu: true };
