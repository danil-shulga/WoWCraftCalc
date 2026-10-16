// Ordinary equipment only; special slots need their own verified rules.
export const disenchantArmor = [
  {
    classId: 4,
    subclassIds: [1, 2, 3, 4],
    inventoryTypes: [1, 3, 5, 6, 7, 8, 9, 10, 20],
  },
  { classId: 4, subclassIds: [1], inventoryTypes: [16] },
  { classId: 4, subclassIds: [0], inventoryTypes: [2, 11, 12, 23] },
  { classId: 4, subclassIds: [6], inventoryTypes: [14] },
]
export const disenchantWeapons = [
  { classId: 2, subclassIds: [0, 4, 7, 13, 15], inventoryTypes: [13, 21, 22] },
  { classId: 2, subclassIds: [1, 5, 6, 8, 10], inventoryTypes: [17] },
  { classId: 2, subclassIds: [2], inventoryTypes: [15] },
  { classId: 2, subclassIds: [3, 18, 19], inventoryTypes: [26] },
]
