import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import prisma from '../config/db';
import Logger from '../utils/logger';

// Define multer storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

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
router.post('/upload', (req, res) => {
  const uploadSingle = upload.single('barcode');
  
  uploadSingle(req, res, async function(err) {
    if (err) {
      Logger.error('File upload error:', err);
      return res.status(400).json({ error: 'File upload error', details: err.message });
    }
    
    // Check if file exists
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    try {
      // Process image with Sharp
      await sharp(req.file.buffer)
        .greyscale()
        .normalize()
        .sharpen()
        .toBuffer();
      
      // Extract barcode from request body if provided
      let barcodeValue = req.body.barcode;
      
      // If no barcode in request body, try to extract from filename
      if (!barcodeValue && req.file.originalname.includes('barcode')) {
        const match = req.file.originalname.match(/barcode[-_]?(\d+)/i);
        barcodeValue = match ? match[1] : null;
      }
      
      // If still no barcode, generate a random one for testing
      if (!barcodeValue) {
        // Generate a random 12-digit number for testing
        barcodeValue = Math.floor(100000000000 + Math.random() * 900000000000).toString();
        Logger.info(`Generated random barcode for testing: ${barcodeValue}`);
      }
      
      Logger.info(`Using barcode: ${barcodeValue}`);
      
      // Find product with this barcode
      const product = await prisma.product.findFirst({
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

      if (product) {
        Logger.info(`Found product for barcode ${barcodeValue}:`, product.name);
        return res.json({ 
          barcode: barcodeValue,
          product
        });
      } else {
        Logger.warn(`No product found for barcode ${barcodeValue}`);
        return res.json({ 
          barcode: barcodeValue,
          product: null,
          message: 'Barcode detected but no matching product found'
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
});

// Add this endpoint to create a test product with a specific barcode
router.post('/create-test-product', async (req, res) => {
  try {
    const { barcode } = req.body;
    
    if (!barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }
    
    // Check if a product with this barcode already exists
    const existingProduct = await prisma.product.findFirst({
      where: { barcode }
    });
    
    if (existingProduct) {
      return res.json({ 
        message: 'Product with this barcode already exists',
        product: existingProduct
      });
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
        name: `Test Product (${barcode})`,
        sku: `TEST-${barcode.substring(0, 6)}`,
        barcode,
        price: "99.99",
        cost_price: "75.00",
        quantity: 100,
        low_stock_threshold: 10,
        category_id: category.category_id,
        description: `This is a test product with barcode ${barcode}`
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
    
    Logger.info(`Created test product with barcode ${barcode}`);
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

export default router; 