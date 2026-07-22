import type { HTMLAttributes } from "react";

type MathMLElementProps = HTMLAttributes<HTMLElement>;

declare global {
  namespace JSX {
    interface IntrinsicElements {
      math: MathMLElementProps & { display?: "block" | "inline" };
      mrow: MathMLElementProps;
      mfrac: MathMLElementProps;
      msub: MathMLElementProps;
      mi: MathMLElementProps;
      mo: MathMLElementProps;
      mn: MathMLElementProps;
    }
  }
}

export {};
