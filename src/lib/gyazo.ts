export interface GyazoUploadResult {
  image_id: string;
  permalink_url: string;
  url: string;
  thumb_url?: string;
  type?: string;
}

export async function uploadToGyazo(
  image: Buffer | ArrayBuffer,
  filename = "schedule.png"
): Promise<GyazoUploadResult> {
  const token = process.env.GYAZO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("GYAZO_ACCESS_TOKEN is not set");
  }

  const bytes = Buffer.isBuffer(image) ? image : Buffer.from(image);
  const form = new FormData();
  form.append(
    "imagedata",
    new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    filename
  );

  const res = await fetch("https://upload.gyazo.com/api/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gyazo upload failed (${res.status}): ${text}`);
  }

  return (await res.json()) as GyazoUploadResult;
}
