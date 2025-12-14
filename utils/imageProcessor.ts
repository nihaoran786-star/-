import { GoogleGenAI, Type } from "@google/genai";
import JSZip from 'jszip';
import saveAs from 'file-saver';

export interface ImageSlice {
  id: number;
  url: string;
  blob: Blob;
  row: number;
  col: number;
  width: number;
  height: number;
}

export interface GridDimensions {
  rows: number;
  cols: number;
}

export interface SplitResult {
  slices: ImageSlice[];
  dimensions: GridDimensions;
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface AnalyzedImage {
  url: string;
  width: number;
  height: number;
  boxes: BoundingBox[];
}

/**
 * Loads an image from a source URL.
 */
const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
};

/**
 * Converts a File or Blob to a Base64 string (without the data URL prefix).
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(blob);
  });
};

/**
 * Uses Gemini AI to detect the bounding boxes of images within a grid.
 */
const detectGridWithAI = async (file: File): Promise<BoundingBox[]> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key is missing.");

    const ai = new GoogleGenAI({ apiKey });
    const base64Data = await blobToBase64(file);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: file.type || 'image/png', data: base64Data } },
          { text: `You are an expert image layout analyzer. This image contains a social media post with a grid of photos (e.g., 9-grid, 6-grid, 4-grid, etc.).

TASK:
1. First, identify the MAIN content area containing the photos. 
   - CRITICAL: You MUST IGNORE phone status bars (signal, battery), social media app headers (user avatar, back button), and footer navigation.
   - Look for the uniform grid pattern. The gaps/gutters between images are consistent.
   
2. Precisely detect the bounding box for EACH individual image panel within that grid.
   - Do NOT include the gaps/gutters between images in the bounding boxes.
   - The bounding boxes should be tight to the visual content of each photo.
   - Maintain the aspect ratio of the individual cells (often 1:1 square, but can be rectangular).

Output a JSON object with a list of 'crops' using 0-1000 normalized scale coordinates.` }
        ]
      },
      config: {
        thinkingConfig: { thinkingBudget: 8192 }, // Increased budget for better spatial reasoning
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            crops: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  ymin: { type: Type.INTEGER },
                  xmin: { type: Type.INTEGER },
                  ymax: { type: Type.INTEGER },
                  xmax: { type: Type.INTEGER },
                },
                required: ["ymin", "xmin", "ymax", "xmax"]
              }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const result = JSON.parse(text);
    if (!result.crops || !Array.isArray(result.crops)) throw new Error("Invalid AI response");

    return result.crops;
  } catch (error) {
    console.error("AI Detection Error:", error);
    throw new Error("AI detection failed. Ensure the image is valid.");
  }
};

/**
 * Upscales an image slice using Gemini AI.
 */
const upscaleSliceWithAI = async (blob: Blob, mimeType: string): Promise<Blob> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return blob; // Fallback to original if no key

    const ai = new GoogleGenAI({ apiKey });
    const base64Data = await blobToBase64(blob);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', // Using image model for editing/generation
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Data } },
          { text: "Enhance this image to high definition (HD). Sharpen details, improve clarity, and remove artifacts. Return the image in high resolution." }
        ]
      }
    });

    // Extract image from response
    // The response candidates should contain the generated image part
    if (response.candidates && response.candidates[0]?.content?.parts) {
       for (const part of response.candidates[0].content.parts) {
         if (part.inlineData && part.inlineData.data) {
           const byteCharacters = atob(part.inlineData.data);
           const byteNumbers = new Array(byteCharacters.length);
           for (let i = 0; i < byteCharacters.length; i++) {
             byteNumbers[i] = byteCharacters.charCodeAt(i);
           }
           const byteArray = new Uint8Array(byteNumbers);
           return new Blob([byteArray], { type: 'image/png' });
         }
       }
    }
    
    console.warn("No image returned from AI upscale, using original");
    return blob;
  } catch (error) {
    console.error("AI Upscale Error:", error);
    return blob; // Fallback
  }
};

/**
 * Organizes raw bounding boxes into a logical grid.
 */
const organizeBoxes = (boxes: BoundingBox[], width: number, height: number) => {
    const pixelBoxes = boxes.map(b => ({
        ...b,
        y: (b.ymin / 1000) * height,
        x: (b.xmin / 1000) * width,
        w: ((b.xmax - b.xmin) / 1000) * width,
        h: ((b.ymax - b.ymin) / 1000) * height,
        cy: ((b.ymin + b.ymax) / 2000) * height, 
        cx: ((b.xmin + b.xmax) / 2000) * width 
    }));

    pixelBoxes.sort((a, b) => a.cy - b.cy);

    const rows: typeof pixelBoxes[] = [];
    if (pixelBoxes.length > 0) {
        let currentRow = [pixelBoxes[0]];
        let currentRowY = pixelBoxes[0].cy;

        for (let i = 1; i < pixelBoxes.length; i++) {
            const box = pixelBoxes[i];
            if (Math.abs(box.cy - currentRowY) < (box.h * 0.5)) {
                currentRow.push(box);
            } else {
                rows.push(currentRow);
                currentRow = [box];
                currentRowY = box.cy;
            }
        }
        rows.push(currentRow);
    }

    let maxCols = 0;
    const sortedBoxes: { box: typeof pixelBoxes[0], row: number, col: number }[] = [];
    
    rows.forEach((rowItems, rowIndex) => {
        rowItems.sort((a, b) => a.cx - b.cx);
        if (rowItems.length > maxCols) maxCols = rowItems.length;
        rowItems.forEach((box, colIndex) => {
            sortedBoxes.push({ box, row: rowIndex, col: colIndex });
        });
    });

    return { sortedBoxes, rows: rows.length, cols: maxCols };
};

export const analyzeGrid = async (file: File): Promise<AnalyzedImage> => {
  const objectUrl = URL.createObjectURL(file);
  const img = await loadImage(objectUrl);
  const detectedCrops = await detectGridWithAI(file);
  if (detectedCrops.length === 0) {
      URL.revokeObjectURL(objectUrl);
      throw new Error("AI did not detect any image panels.");
  }
  return { url: objectUrl, width: img.width, height: img.height, boxes: detectedCrops };
};

export const generateSlices = async (file: File, boxes: BoundingBox[]): Promise<SplitResult> => {
  const objectUrl = URL.createObjectURL(file);
  const img = await loadImage(objectUrl);

  if (boxes.length === 0) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("No boxes to process.");
  }

  const { sortedBoxes, rows, cols } = organizeBoxes(boxes, img.width, img.height);
  const slices: ImageSlice[] = [];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas error");
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  // Process sequentially to respect potential rate limits, or minimal concurrency
  // Using sequential for safety with Gemini API tier
  for (let i = 0; i < sortedBoxes.length; i++) {
      const item = sortedBoxes[i];
      const { x, y, w, h } = item.box;

      // 1. Crop original (no upscale yet)
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = w;
      cropCanvas.height = h;
      const cropCtx = cropCanvas.getContext('2d');
      if (cropCtx) {
          cropCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
      }

      const cropBlob = await new Promise<Blob | null>(resolve => 
          cropCanvas.toBlob(resolve, 'image/png')
      );

      if (cropBlob) {
          // 2. Upscale with AI
          // Only upscale if the image is small (e.g. < 800px width) to save API calls/time
          // Or just do it for all as requested. Let's do it for all to ensure quality.
          const upscaledBlob = await upscaleSliceWithAI(cropBlob, 'image/png');
          
          // Get dimensions of result
          const resultBitmap = await createImageBitmap(upscaledBlob);
          
          slices.push({
              id: i,
              url: URL.createObjectURL(upscaledBlob),
              blob: upscaledBlob,
              row: item.row,
              col: item.col,
              width: resultBitmap.width,
              height: resultBitmap.height
          });
      }
  }
  
  URL.revokeObjectURL(objectUrl);

  return { slices, dimensions: { rows, cols } };
};

export const downloadAllSlices = async (slices: ImageSlice[], filenamePrefix = 'slice') => {
  const zip = new JSZip();
  slices.forEach((slice, index) => {
    const ext = slice.blob.type.split('/')[1] || 'png';
    zip.file(`${filenamePrefix}_${index + 1}.${ext}`, slice.blob);
  });
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "smart-grid-hd-images.zip");
};