import bwipjs from 'bwip-js';
import path from 'path';
import fs from 'fs/promises';

export async function generateBarcodeImage(
  barcodeText: string,
  productSku: string
): Promise<string> {
  try {
    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'public', 'barcodes');
    await fs.mkdir(uploadsDir, { recursive: true });

    // Generate barcode image
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: barcodeText,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: 'center',
    });

    // Create filename using SKU
    const fileName = `barcode_${productSku}_${Date.now()}.png`;
    const filePath = path.join(uploadsDir, fileName);

    // Save the barcode image
    await fs.writeFile(filePath, png);

    return `/barcodes/${fileName}`;
  } catch (error) {
    console.error('Barcode generation error:', error);
    throw new Error('Failed to generate barcode image');
  }
}