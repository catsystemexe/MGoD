export type BgBinding = {
  levelId: string;
  presetId: string;
  transition?: {
    type: "fade" | "cross";
    duration: number;
    easing?: string;
  };
};
