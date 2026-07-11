declare namespace JSX {
  interface IntrinsicElements {
    "model-viewer": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      src?: string;
      "auto-rotate"?: boolean | string;
      "camera-controls"?: boolean | string;
      "shadow-intensity"?: string;
      "environment-image"?: string;
      alt?: string;
    };
  }
}
