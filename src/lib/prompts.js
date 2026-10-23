// Prompts para generar con IA las fotos que faltan (segunda foto de la pieza y foto de piedra del cuadro pequeño).
// El estilo común se edita en Panel → Ajustes → Fotos con IA; la descripción de cada pieza sale de esta lista o de sus datos.

export const DEFAULT_STYLE = 'Fotografía de producto de joyería fina, plano cenital (flat lay), la pieza sola sobre una superficie de piedra travertino color arena cálida (#E7D6C3) con un pliegue de lino blanco, luz natural suave de ventana desde la izquierda, sombras largas y delicadas, cadena con baño de oro 18k de eslabones finos con brillo cálido, enfoque nítido en la piedra, profundidad de campo corta, estética editorial minimalista de lujo silencioso, mucho espacio negativo, formato vertical 2:3, 1200×1800, sin texto, sin logos, sin manos, sin personas.';
export const DEFAULT_STONE_STYLE = 'Fotografía macro de [PIEDRA] natural, varias piezas pulidas y en bruto agrupadas sobre lino color arena cálida (#F3EBE1), luz natural suave de ventana desde la izquierda, sombras delicadas, enfoque nítido, profundidad de campo corta, tonos cálidos, estética editorial minimalista de joyería de lujo, encuadre cuadrado 1:1, 1200×1200, sin texto, sin manos, sin joyas.';

const PIECES = {
  ocaso: 'Collar de cadena fina dorada con un dije de amatista natural tallada en disco liso y plano, color violeta translúcido con vetas claras, y su pulsera a juego con el mismo disco de amatista y cadena de extensión, ambas piezas dispuestas en curva suave, una junto a la otra.',
  'ecos-de-nueva-cadiz': 'Collar de doble cadena fina dorada en dos capas, con pequeñas perlas blancas redondas que cuelgan a intervalos regulares de cada cadena como gotas, extendido en dos arcos paralelos.',
  'fuego-y-viento': 'Collar de cadena fina dorada con un dije ovalado y torneado de ojo de tigre (marrón miel con reflejos dorados sedosos) sujeto con una tapita dorada, y pulsera de cadena fina con una sola cuenta redonda de ojo de tigre.',
  'trilogia-caribe': 'Collar de cadena fina dorada con tres perlas blancas pequeñas y redondas juntas en el centro, y pulsera a juego con tres perlas, en dos curvas suaves; añade una concha pequeña desenfocada al fondo.',
  'luz-y-fe': 'Collar de cadena fina dorada con una perla barroca blanca nacarada de silueta irregular en forma de cruz suave al centro, y pulsera con la misma perla barroca en forma de cruz.',
  'marea-rosa': 'Collar de cadena fina dorada con una fila de chips de cuarzo rosado de silueta irregular al centro, rosa pálido translúcido, y pulsera con la misma fila de chips; añade dos o tres cristales de sal rosada desenfocados.',
  'punta-arenas': 'Collar tipo lariat en Y de cadena fina dorada con un pequeño disco dorado liso al final de la caída, y pulsera fina con un pequeño disco dorado, sobre arena clara fina en lugar de travertino.',
  'vuelo-coral': 'Collar de cadena fina dorada con una fila de chips de piedra negra brillante de silueta irregular al centro, y pulsera con la misma fila de chips negros; acento: una pluma rosa coral desenfocada en una esquina.',
  'verde-manglar': 'Collar de cadena fina dorada con una cuenta redonda de piedra verde musgo con vetas oscuras, y pulsera con la misma cuenta verde; acento: una hoja de mangle verde desenfocada.',
  'ecos-de-pampatar': 'Collar de cadena fina dorada con un eslabón ovalado que sostiene una medalla dorada martillada con textura de piedra colonial, una cuenta negra pequeña y una perla blanca, y pulsera de cadena con los mismos dijes colgando del cierre.',
  'mapa-de-venezuela': 'Collar en Y de cadena fina dorada con cuentas nacaradas amarillas, azules y rojas, y un dije dorado calado con la silueta del mapa de Venezuela al final de la caída, y pulsera con cuentas amarillas, azules y rojas; fondo de lino blanco.',
  'latido-tricolor': 'Dos cadenas finas doradas en capas: una con cuentas pequeñas amarillas, azules y rojas, y otra con un dije dorado del mapa de Venezuela, más una pulsera con cuentas amarillas, azules y rojas; fondo de lino blanco.',
};

export function hoverPrompt(p, style) {
  const desc = PIECES[p.slug] || `${p.type || 'Pieza'} "${p.name}": ${p.detail || p.stone || ''}, con cadena fina con baño de oro 18k.`;
  return `${desc}\n\n${style || DEFAULT_STYLE}\n\nUsa la foto actual de la pieza como imagen de referencia: la piedra, la cadena y la cantidad de cuentas deben coincidir.`;
}

export function stonePrompt(stoneName, style) {
  return (style || DEFAULT_STONE_STYLE).replace('[PIEDRA]', stoneName || 'la piedra');
}
