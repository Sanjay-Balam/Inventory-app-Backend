import bwipjs from 'bwip-js';
import path from 'path';
import fs from 'fs/promises';


export async function generateBarcodeImage(
  barcodeText: string,
  productSku: string,
  productName?: string
): Promise<string> {
  try {
    console.log(`Generating barcode for SKU: ${productSku}, Name: ${productName || 'N/A'}`);
    
    // Validate inputs
    if (!barcodeText) {
      throw new Error('Barcode text is required');
    }
    
    if (!productSku) {
      throw new Error('Product SKU is required');
    }
    
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
    // Format product name to be URL-friendly (replace spaces with hyphens, remove special characters)
    // Use a default name if productName is undefined or empty
    const safeProductName = productName || 'product';
    
    const formattedName = safeProductName
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')  // Remove special characters
      .replace(/\s+/g, '-')      // Replace spaces with hyphens
      .substring(0, 30);         // Limit length to avoid extremely long filenames
    
    const fileName = `barcode_${productSku}_${formattedName}_${Date.now()}.png`;
    const filePath = path.join(uploadsDir, fileName);

    // Save the barcode image
    await fs.writeFile(filePath, png);
    
    console.log(`Barcode generated successfully: ${fileName}`);
    return `/barcodes/${fileName}`;
  } catch (error) {
    console.error('Barcode generation error:', error);
    // Return a more detailed error message
    if (error instanceof Error) {
      throw new Error(`Failed to generate barcode image: ${error.message}`);
    } else {
      throw new Error('Failed to generate barcode image: Unknown error');
    }
  }
}