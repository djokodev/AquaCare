import type { ImageSourcePropType } from 'react-native';

const dibaqLogo = require('../../../../assets/products/DIBAQ.png');
const allerAquaLogo = require('../../../../assets/products/Aller_Aqua.jpeg');

const PRODUCT_BRAND_ASSETS: Record<string, ImageSourcePropType> = {
  dibaq: dibaqLogo,
  aller_aqua: allerAquaLogo,
};

export const getProductBrandAsset = (brand?: string | null): ImageSourcePropType => {
  if (!brand) {
    return dibaqLogo;
  }

  return PRODUCT_BRAND_ASSETS[brand.toLowerCase()] ?? dibaqLogo;
};
