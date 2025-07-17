import QRCode from 'qrcode';

export class QRCodeService {
  private static instance: QRCodeService;

  private constructor() {}

  public static getInstance(): QRCodeService {
    if (!QRCodeService.instance) {
      QRCodeService.instance = new QRCodeService();
    }
    return QRCodeService.instance;
  }

  /**
   * Generate QR code for a single wallet address
   */
  public async generateQRCode(address: string): Promise<string> {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(address, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      
      return qrCodeDataURL;
    } catch (error) {
      throw new Error(`Failed to generate QR code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate QR codes for all wallet addresses
   */
  public async generateWalletQRCodes(addresses: {
    ethereum: string;
    bsc: string;
    polygon: string;
    solana: string;
    tron: string;
  }): Promise<{
    ethereum: string;
    bsc: string;
    polygon: string;
    solana: string;
    tron: string;
  }> {
    try {
      const [ethereumQR, bscQR, polygonQR, solanaQR, tronQR] = await Promise.all([
        this.generateQRCode(addresses.ethereum),
        this.generateQRCode(addresses.bsc),
        this.generateQRCode(addresses.polygon),
        this.generateQRCode(addresses.solana),
        this.generateQRCode(addresses.tron),
      ]);

      return {
        ethereum: ethereumQR,
        bsc: bscQR,
        polygon: polygonQR,
        solana: solanaQR,
        tron: tronQR,
      };
    } catch (error) {
      throw new Error(`Failed to generate wallet QR codes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate QR code with custom styling for specific chain
   */
  public async generateChainQRCode(
    address: string, 
    chain: 'ethereum' | 'bsc' | 'polygon' | 'solana' | 'tron'
  ): Promise<string> {
    const chainColors = {
      ethereum: { dark: '#627EEA', light: '#FFFFFF' },
      bsc: { dark: '#F3BA2F', light: '#FFFFFF' },
      polygon: { dark: '#8247E5', light: '#FFFFFF' },
      solana: { dark: '#14F195', light: '#FFFFFF' },
      tron: { dark: '#0088CC', light: '#FFFFFF' },
    };

    try {
      const qrCodeDataURL = await QRCode.toDataURL(address, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        margin: 1,
        color: chainColors[chain],
        width: 256,
      });
      
      return qrCodeDataURL;
    } catch (error) {
      throw new Error(`Failed to generate QR code for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 