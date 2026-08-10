import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at top, #0b1324 0%, #030712 70%)",
          color: "#38bdf8",
          fontSize: 180,
          fontWeight: 800,
          letterSpacing: "0.04em",
        }}
      >
        V
      </div>
    ),
    size,
  );
}
