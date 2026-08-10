import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#030712",
          color: "#38bdf8",
          fontSize: 90,
          fontWeight: 800,
        }}
      >
        V
      </div>
    ),
    size,
  );
}
