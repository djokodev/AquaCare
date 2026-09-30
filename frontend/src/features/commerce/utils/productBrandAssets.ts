import type { ImageSourcePropType } from 'react-native';

/** AquaCare ne commercialise que DIBAQ : tous les produits affichent le sac DIBAQ. */
const dibaqLogo = require('../../../../assets/products/DIBAQ.png');

export const getProductBrandAsset = (_brand?: string | null): ImageSourcePropType => dibaqLogo;
