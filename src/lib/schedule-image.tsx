import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import {
  LEFT_HOURS,
  RIGHT_HOURS,
  hourSlotKeys,
  ScheduleSlots,
} from "@/lib/schedule";

const COL_TIME = 52;
const COL_PLAN = 200;
const COL_PROGRESS = 200;
const TABLE_WIDTH = COL_TIME + COL_PLAN + COL_PROGRESS;
const GAP = 16;
const WIDTH = TABLE_WIDTH * 2 + GAP;
const HEADER_H = 28;
const SLOT_H = 22;
const HOUR_H = SLOT_H * 4;
const HEIGHT = HEADER_H + HOUR_H * LEFT_HOURS.length;

let fontCache: ArrayBuffer | null = null;

async function loadFont(): Promise<ArrayBuffer> {
  if (fontCache) return fontCache;
  try {
    const filePath = path.join(
      process.cwd(),
      "public/fonts/NotoSansJP-400.woff"
    );
    const buf = await readFile(filePath);
    fontCache = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength
    );
    return fontCache;
  } catch {
    const res = await fetch(
      "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@5.2.5/japanese-400-normal.woff"
    );
    if (!res.ok) throw new Error("Failed to load Japanese font");
    fontCache = await res.arrayBuffer();
    return fontCache;
  }
}

function formatHourLabel(hour: number): string {
  return `${hour}:00`;
}

function TableHeader() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        width: TABLE_WIDTH,
        height: HEADER_H,
        borderBottom: "2px solid #000",
        borderTop: "2px solid #000",
        borderLeft: "2px solid #000",
        borderRight: "2px solid #000",
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      <div
        style={{
          width: COL_TIME,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRight: "1px solid #000",
        }}
      />
      <div
        style={{
          width: COL_PLAN,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRight: "1px solid #000",
        }}
      >
        今日の予定
      </div>
      <div
        style={{
          width: COL_PROGRESS,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        実際の進行
      </div>
    </div>
  );
}

function HourBlock({
  hour,
  plan,
  progress,
}: {
  hour: number;
  plan: Map<number, string>;
  progress: Map<number, string>;
}) {
  const keys = hourSlotKeys(hour);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        width: TABLE_WIDTH,
        height: HOUR_H,
        borderLeft: "2px solid #000",
        borderRight: "2px solid #000",
        borderBottom: "2px solid #000",
      }}
    >
      <div
        style={{
          width: COL_TIME,
          height: HOUR_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRight: "1px solid #000",
          fontSize: 12,
        }}
      >
        {formatHourLabel(hour)}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: COL_PLAN,
          borderRight: "1px solid #000",
        }}
      >
        {keys.map((k, i) => (
          <div
            key={`p-${k}`}
            style={{
              height: SLOT_H,
              display: "flex",
              alignItems: "center",
              paddingLeft: 4,
              paddingRight: 2,
              fontSize: 11,
              borderBottom: i < 3 ? "1px dashed #999" : "none",
              lineHeight: 1.1,
              overflow: "hidden",
            }}
          >
            {(plan.get(k) ?? "").replaceAll("\n", " / ")}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: COL_PROGRESS,
        }}
      >
        {keys.map((k, i) => (
          <div
            key={`r-${k}`}
            style={{
              height: SLOT_H,
              display: "flex",
              alignItems: "center",
              paddingLeft: 4,
              paddingRight: 2,
              fontSize: 11,
              borderBottom: i < 3 ? "1px dashed #999" : "none",
              lineHeight: 1.1,
              overflow: "hidden",
            }}
          >
            {(progress.get(k) ?? "").replaceAll("\n", " / ")}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduleTable({
  hours,
  plan,
  progress,
}: {
  hours: readonly number[];
  plan: Map<number, string>;
  progress: Map<number, string>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: TABLE_WIDTH }}>
      <TableHeader />
      {hours.map((h) => (
        <HourBlock key={h} hour={h} plan={plan} progress={progress} />
      ))}
    </div>
  );
}

export async function renderSchedulePng(slots: ScheduleSlots): Promise<Buffer> {
  const font = await loadFont();
  const { plan, progress } = slots;

  const element = (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "row",
        backgroundColor: "#ffffff",
        fontFamily: "NotoSansJP",
        color: "#000",
      }}
    >
      <ScheduleTable hours={LEFT_HOURS} plan={plan} progress={progress} />
      <div style={{ width: GAP, display: "flex" }} />
      <ScheduleTable hours={RIGHT_HOURS} plan={plan} progress={progress} />
    </div>
  );

  const response = new ImageResponse(element, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      {
        name: "NotoSansJP",
        data: font,
        style: "normal",
        weight: 400,
      },
    ],
  });

  const ab = await response.arrayBuffer();
  return Buffer.from(ab);
}
