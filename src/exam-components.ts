import { createComponent, Types } from '@iwsdk/core';

/** Marks one of the three big answer buttons on the exam sheet. slot: 0=A, 1=B, 2=C */
export const ExamButton = createComponent('ExamButton', {
  slot: { type: Types.Int8, default: 0 },
});

/** Peek UI buttons. kind: 0 = PEEK bubble over the left kid, 1 = PEEK bubble over the right kid, 2 = HIDE button on the note */
export const PeekButton = createComponent('PeekButton', {
  kind: { type: Types.Int8, default: 0 },
});

/** Phone UI buttons. kind: 0 = the phone lying on the desk (tap to raise), 1 = ASK, 2 = HIDE */
export const PhoneButton = createComponent('PhoneButton', {
  kind: { type: Types.Int8, default: 0 },
});

/** Fruit throw UI. kind: 0 = the fruit bowl, 1 = left throw zone, 2 = right throw zone */
export const FruitButton = createComponent('FruitButton', {
  kind: { type: Types.Int8, default: 0 },
});
