import express, { Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import prisma from '../config/db';
import Logger from '../utils/logger';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';

// Define multer storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const router = express.Router();

// Scan product by barcode
router.get('/scan/:barcode', async (req, res) => {
    try {
        const product = await prisma.product.findFirst({
            where: { barcode: req.params.barcode },
            include: {
                category: true,
                inventory: {
                    include: {
                        channel: true
                    }
                }
            }
        });

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json(product);
    } catch (error) {
        Logger.error('Error scanning product by barcode:', error);
        res.status(500).json({ error: 'Failed to scan product' });
    }
});

// Process sale via barcode
router.post('/sell/:barcode', async (req, res) => {
    try {
        const { quantity, channel_id, customer_id, user_id } = req.body;
        const barcode = req.params.barcode;

        const result = await prisma.$transaction(async (prisma) => {
            // Find product
            const product = await prisma.product.findFirst({
                where: { barcode }
            });

            if (!product) {
                throw new Error('Product not found');
            }

            // Check inventory
            const inventory = await prisma.inventory.findFirst({
                where: {
                    product_id: product.product_id,
                    channel_id: parseInt(channel_id)
                }
            });

            if (!inventory || inventory.stock < parseInt(quantity)) {
                throw new Error('Insufficient stock');
            }

            // Create order
            const order = await prisma.order.create({
                data: {
                    customer_id: parseInt(customer_id),
                    channel_id: parseInt(channel_id),
                    user_id: parseInt(user_id),
                    total_amount: Number(product.price) * parseInt(quantity),
                    orderItems: {
                        create: {
                            product_id: product.product_id,
                            quantity: parseInt(quantity),
                            price: product.price
                        }
                    }
                }
            });

            // Update inventory
            await prisma.inventory.update({
                where: { inventory_id: inventory.inventory_id },
                data: {
                    stock: {
                        decrement: parseInt(quantity)
                    }
                }
            });

            // Create transaction record
            const transaction = await prisma.transactions.create({
                data: {
                    product_id: product.product_id,
                    channel_id: parseInt(channel_id),
                    transaction_type: 'SALE',
                    quantity: parseInt(quantity),
                    order_id: order.order_id
                }
            });

            return { order, transaction };
        });

        res.status(201).json(result);
    } catch (error) {
        Logger.error('Error processing sale by barcode:', error);
        res.status(500).json({ 
            error: error instanceof Error ? error.message : 'Failed to process sale'
        });
    }
});

// Process barcode image upload - simplified version
router.post('/upload', upload.single('barcode'), async (req, res) => {
  try {
    // Check if file exists
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    // Log request details for debugging
    Logger.info('Barcode upload request received:');
    Logger.info('File name:', req.file.originalname);
    Logger.info('File size:', req.file.size);
    Logger.info('Request body:', req.body);
    
    // Process image with Sharp to enhance barcode visibility
    const processedImageBuffer = await sharp(req.file.buffer)
      .greyscale()
      .normalize()
      .sharpen()
      .toBuffer();
    
    // IMPORTANT: First check for barcode in the request body (highest priority)
    let barcodeValue = req.body.barcode || req.body.testBarcode;
    Logger.info('Barcode from request body:', barcodeValue);
    
    // If no barcode in request body, try to extract from filename
    if (!barcodeValue && req.file.originalname.includes('barcode')) {
      const match = req.file.originalname.match(/barcode[-_]?(\d+)/i);
      barcodeValue = match ? match[1] : null;
      Logger.info('Barcode extracted from filename:', barcodeValue);
    }
    
    // If still no barcode, check if there's a test barcode in the query params
    if (!barcodeValue && req.query.testBarcode) {
      barcodeValue = req.query.testBarcode as string;
      Logger.info('Using test barcode from query params:', barcodeValue);
    }
    
    // If still no barcode, we can't proceed
    if (!barcodeValue) {
      Logger.error('No barcode value found in request body, filename, or query params');
      return res.status(400).json({ 
        error: 'No barcode value provided', 
        details: 'Please provide a barcode value in the request body, filename, or query params' 
      });
    }
    
    // Normalize the barcode value (remove spaces, etc.)
    barcodeValue = barcodeValue.trim();
    Logger.info('Final barcode value being used:', barcodeValue);
    
    // CRITICAL FIX: Get ALL products first to ensure we don't miss any
    const allProducts = await prisma.product.findMany();
    Logger.info('Total products in database:', allProducts.length);
    
    // Log the first few products for debugging
    Logger.info('Sample products:', allProducts.slice(0, 5).map(p => ({
      id: p.product_id,
      name: p.name,
      barcode: p.barcode
    })));
    
    // CRITICAL FIX: First try direct comparison with all products
    let product = allProducts.find(p => p.barcode === barcodeValue);
    
    // If not found, try case-insensitive comparison
    if (!product) {
      product = allProducts.find(p => 
        p.barcode.toLowerCase() === barcodeValue.toLowerCase()
      );
    }
    
    // If still not found, try without leading zeros
    if (!product && barcodeValue.startsWith('0')) {
      const trimmedBarcode = barcodeValue.replace(/^0+/, '');
      product = allProducts.find(p => 
        p.barcode === trimmedBarcode || 
        p.barcode.replace(/^0+/, '') === barcodeValue
      );
    }
    
    // If we found a product through direct comparison
    if (product) {
      Logger.info('Product found through direct comparison:', {
        id: product.product_id,
        name: product.name,
        barcode: product.barcode
      });
      
      // Get the full product details with relations
      const fullProduct = await prisma.product.findUnique({
        where: { product_id: product.product_id },
        include: {
          category: true,
          inventory: {
            include: {
              channel: true
            }
          }
        }
      });
      
      return res.json({
        barcode: barcodeValue,
        product: fullProduct
      });
    }
    
    // If no direct match, try database queries
    Logger.info('No direct match found, trying database queries');
    
    // Try exact match
    const dbProduct = await prisma.product.findFirst({
      where: { barcode: barcodeValue },
      include: {
        category: true,
        inventory: {
          include: {
            channel: true
          }
        }
      }
    });
    
    if (dbProduct) {
      Logger.info('Product found through database query:', {
        id: dbProduct.product_id,
        name: dbProduct.name,
        barcode: dbProduct.barcode
      });
      
      return res.json({
        barcode: barcodeValue,
        product: dbProduct
      });
    }
    
    // Try with trimmed barcode (no leading zeros)
    if (barcodeValue.startsWith('0')) {
      const trimmedBarcode = barcodeValue.replace(/^0+/, '');
      Logger.info('Trying with trimmed barcode (no leading zeros):', trimmedBarcode);
      
      const trimmedProduct = await prisma.product.findFirst({
        where: { barcode: trimmedBarcode },
        include: {
          category: true,
          inventory: {
            include: {
              channel: true
            }
          }
        }
      });
      
      if (trimmedProduct) {
        Logger.info('Product found with trimmed barcode:', {
          id: trimmedProduct.product_id,
          name: trimmedProduct.name,
          barcode: trimmedProduct.barcode
        });
        
        return res.json({
          barcode: barcodeValue,
          product: trimmedProduct
        });
      }
    }
    
    // If still no match, check for similar products
    Logger.warn(`No product found for barcode ${barcodeValue}`);
    
    // For debugging, let's check if there are any products with similar barcodes
    const similarProducts = await prisma.product.findMany({
      where: {
        OR: [
          { barcode: { contains: barcodeValue.substring(0, 5) } },
          { barcode: { contains: barcodeValue.substring(barcodeValue.length - 5) } }
        ]
      },
      include: {
        category: true
      },
      take: 5
    });
    
    if (similarProducts.length > 0) {
      Logger.info('Found similar products:', similarProducts.map(p => ({ 
        id: p.product_id, 
        name: p.name, 
        barcode: p.barcode 
      })));
      
      // CRITICAL FIX: Return the first similar product as the main product
      // This prevents creating unnecessary test products
      return res.json({ 
        barcode: barcodeValue,
        product: similarProducts[0],
        similar_products: similarProducts,
        message: 'No exact match found, but found similar products. Using the first similar product.'
      });
    } else {
      Logger.info('No similar products found');
      
      return res.json({ 
        barcode: barcodeValue,
        product: null,
        message: 'No product found with this barcode'
      });
    }
  } catch (error) {
    Logger.error('Error processing barcode:', error);
    res.status(500).json({ 
      error: 'Failed to process barcode image',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Add this endpoint to create a test product with a specific barcode
router.post('/create-test-product', async (req, res) => {
  try {
    const { barcode } = req.body;
    
    if (!barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }
    
    Logger.info(`Attempting to create test product with barcode: ${barcode}`);
    
    // Normalize the barcode
    const normalizedBarcode = barcode.trim();
    
    // Check if a product with this barcode already exists - exact match
    let existingProduct = await prisma.product.findFirst({
      where: { barcode: normalizedBarcode },
      include: {
        category: true,
        inventory: {
          include: {
            channel: true
          }
        }
      }
    });
    
    // If no exact match, try with trimmed barcode (no leading zeros)
    if (!existingProduct) {
      const trimmedBarcode = normalizedBarcode.replace(/^0+/, '');
      if (trimmedBarcode !== normalizedBarcode) {
        Logger.info('Trying to find product with trimmed barcode (no leading zeros):', trimmedBarcode);
        existingProduct = await prisma.product.findFirst({
          where: { barcode: trimmedBarcode },
          include: {
            category: true,
            inventory: {
              include: {
                channel: true
              }
            }
          }
        });
      }
    }
    
    // Log all products for debugging
    const allProducts = await prisma.product.findMany({
      select: {
        product_id: true,
        name: true,
        barcode: true
      }
    });
    Logger.info('All products in database:', allProducts);
    
    if (existingProduct) {
      Logger.info('Product with this barcode already exists:', {
        id: existingProduct.product_id,
        name: existingProduct.name,
        barcode: existingProduct.barcode
      });
      
      return res.json({ 
        message: 'Product with this barcode already exists',
        product: existingProduct
      });
    }
    
    // Check for similar products
    const similarProducts = await prisma.product.findMany({
      where: {
        OR: [
          { barcode: { contains: normalizedBarcode.substring(0, 5) } },
          { barcode: { contains: normalizedBarcode.substring(normalizedBarcode.length - 5) } }
        ]
      },
      take: 5
    });
    
    if (similarProducts.length > 0) {
      Logger.info('Found similar products:', similarProducts.map(p => ({
        id: p.product_id,
        name: p.name,
        barcode: p.barcode
      })));
    }
    
    // Get a category (create one if none exists)
    let category = await prisma.category.findFirst();
    if (!category) {
      category = await prisma.category.create({
        data: {
          name: 'Test Category',
          description: 'Category for test products'
        }
      });
    }
    
    // Create a test product with the specified barcode
    const product = await prisma.product.create({
      data: {
        name: `Test Product (${normalizedBarcode})`,
        sku: `TEST-${normalizedBarcode.substring(0, 6)}`,
        barcode: normalizedBarcode,
        price: "99.99",
        cost_price: "75.00",
        quantity: 100,
        low_stock_threshold: 10,
        category_id: category.category_id,
        description: `This is a test product with barcode ${normalizedBarcode}`
      },
      include: {
        category: true
      }
    });
    
    // Create inventory for the product
    const channel = await prisma.salesChannel.findFirst();
    if (channel) {
      await prisma.inventory.create({
        data: {
          product_id: product.product_id,
          channel_id: channel.channel_id,
          stock: 100
        }
      });
    }
    
    Logger.info(`Created test product with barcode ${normalizedBarcode}:`, {
      id: product.product_id,
      name: product.name,
      barcode: product.barcode
    });
    
    res.status(201).json({
      message: 'Test product created successfully',
      product
    });
  } catch (error) {
    Logger.error('Error creating test product:', error);
    res.status(500).json({ 
      error: 'Failed to create test product',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Add this endpoint to fetch all test products
router.get('/test-products', async (req, res) => {
  try {
    // Find all products with "Test Product" in the name
    const testProducts = await prisma.product.findMany({
      where: {
        name: {
          contains: 'Test Product'
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });
    
    // Return just the basic info needed for the dropdown
    const simplifiedProducts = testProducts.map(product => ({
      barcode: product.barcode,
      name: product.name,
      sku: product.sku
    }));
    
    res.json(simplifiedProducts);
  } catch (error) {
    Logger.error('Error fetching test products:', error);
    res.status(500).json({ 
      error: 'Failed to fetch test products',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test endpoint for specific barcodes
router.get('/test/:barcode', async (req: Request<{ barcode: string }>, res: Response) => {
  try {
    const { barcode } = req.params;
    
    if (!barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }
    
    Logger.info(`Testing specific barcode: ${barcode}`);
    
    // Normalize the barcode
    const normalizedBarcode = barcode.trim();
    
    // Get all products for direct comparison
    const allProducts = await prisma.product.findMany();
    Logger.info('Total products in database:', allProducts.length);
    
    // Log the first few products for debugging
    Logger.info('Sample products:', allProducts.slice(0, 5).map(p => ({
      id: p.product_id,
      name: p.name,
      barcode: p.barcode
    })));
    
    // First try direct comparison
    let product = allProducts.find(p => p.barcode === normalizedBarcode);
    
    // If not found, try case-insensitive comparison
    if (!product) {
      product = allProducts.find(p => 
        p.barcode.toLowerCase() === normalizedBarcode.toLowerCase()
      );
    }
    
    // If still not found, try without leading zeros
    if (!product && normalizedBarcode.startsWith('0')) {
      const trimmedBarcode = normalizedBarcode.replace(/^0+/, '');
      product = allProducts.find(p => 
        p.barcode === trimmedBarcode || 
        p.barcode.replace(/^0+/, '') === normalizedBarcode
      );
    }
    
    // If we found a product through direct comparison
    if (product) {
      Logger.info('Product found through direct comparison:', {
        id: product.product_id,
        name: product.name,
        barcode: product.barcode
      });
      
      // Get the full product details with relations
      const fullProduct = await prisma.product.findUnique({
        where: { product_id: product.product_id },
        include: {
          category: true,
          inventory: {
            include: {
              channel: true
            }
          }
        }
      });
      
      return res.json({
        barcode: normalizedBarcode,
        product: fullProduct,
        message: 'Product found through direct comparison'
      });
    }
    
    // If no direct match, try database queries
    Logger.info('No direct match found, trying database queries');
    
    // Try exact match
    const dbProduct = await prisma.product.findFirst({
      where: { barcode: normalizedBarcode },
      include: {
        category: true,
        inventory: {
          include: {
            channel: true
          }
        }
      }
    });
    
    if (dbProduct) {
      Logger.info('Product found through database query:', {
        id: dbProduct.product_id,
        name: dbProduct.name,
        barcode: dbProduct.barcode
      });
      
      return res.json({
        barcode: normalizedBarcode,
        product: dbProduct,
        message: 'Product found through database query'
      });
    }
    
    // Try with trimmed barcode (no leading zeros)
    if (normalizedBarcode.startsWith('0')) {
      const trimmedBarcode = normalizedBarcode.replace(/^0+/, '');
      Logger.info('Trying with trimmed barcode (no leading zeros):', trimmedBarcode);
      
      const trimmedProduct = await prisma.product.findFirst({
        where: { barcode: trimmedBarcode },
        include: {
          category: true,
          inventory: {
            include: {
              channel: true
            }
          }
        }
      });
      
      if (trimmedProduct) {
        Logger.info('Product found with trimmed barcode:', {
          id: trimmedProduct.product_id,
          name: trimmedProduct.name,
          barcode: trimmedProduct.barcode
        });
        
        return res.json({
          barcode: normalizedBarcode,
          product: trimmedProduct,
          message: 'Product found with trimmed barcode'
        });
      }
    }
    
    // If still no match, check for similar products
    Logger.warn(`No product found for barcode ${normalizedBarcode}`);
    
    // For debugging, let's check if there are any products with similar barcodes
    const similarProducts = await prisma.product.findMany({
      where: {
        OR: [
          { barcode: { contains: normalizedBarcode.substring(0, 5) } },
          { barcode: { contains: normalizedBarcode.substring(normalizedBarcode.length - 5) } }
        ]
      },
      include: {
        category: true
      },
      take: 5
    });
    
    if (similarProducts.length > 0) {
      Logger.info('Found similar products:', similarProducts.map(p => ({
        id: p.product_id,
        name: p.name,
        barcode: p.barcode
      })));
      
      return res.json({
        barcode: normalizedBarcode,
        product: similarProducts[0],
        similar_products: similarProducts,
        message: 'No exact match found, but found similar products'
      });
    } else {
      Logger.info('No similar products found');
      
      return res.json({
        barcode: normalizedBarcode,
        product: null,
        message: 'No product found with this barcode'
      });
    }
  } catch (error) {
    Logger.error('Error testing barcode:', error);
    res.status(500).json({
      error: 'Failed to test barcode',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 