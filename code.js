if (figma.editorType === 'figma') {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) {
    figma.closePlugin('❌ Selecione UM ÚNICO frame ou grupo contendo os Car Cards.');
  }

  const container = selection[0];
  const carCards = container.findAll(n => n.name === 'Car Card');
  if (carCards.length === 0) {
    figma.closePlugin('❌ Nenhum "Car Card" encontrado.');
  }

  fetch(`http://localhost:3333/carros?quantidade=${carCards.length}`)
    .then(res => res.json())
    .then(async carros => {
      for (let i = 0; i < carCards.length; i++) {
        const card = carCards[i];
        const carro = carros[i];

        // Foto
        const fotoNode = card.findOne(n => n.name === 'foto' && n.type === 'RECTANGLE');
        if (fotoNode && carro.imageUrl) {
          try {
            const response = await fetch(`http://localhost:3333/proxy-image?url=${encodeURIComponent(carro.imageUrl)}`);
            const buffer = await response.arrayBuffer();
            const image = await figma.createImage(new Uint8Array(buffer));
            fotoNode.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
          } catch (err) {
            console.error('Erro ao carregar imagem:', err);
          }
        }

        // Função para texto
        async function setText(node, value) {
          if (!node || value == null) return;
          await figma.loadFontAsync(node.fontName);
          node.characters = String(value);
        }

        // Textos
        await setText(card.findOne(n => n.name === 'marcaModelo' && n.type === 'TEXT'), carro.marcaModelo);
        await setText(card.findOne(n => n.name === 'ano' && n.type === 'TEXT'), carro.ano);
        await setText(card.findOne(n => n.name === 'valorDiario' && n.type === 'TEXT'), carro.valorDiario);
        await setText(card.findOne(n => n.name === 'combustivel' && n.type === 'TEXT'), carro.combustivel);
        await setText(card.findOne(n => n.name === 'lugares' && n.type === 'TEXT'), carro.lugares);
        await setText(card.findOne(n => n.name === 'cambio' && n.type === 'TEXT'), carro.cambio);
        await setText(card.findOne(n => n.name === 'motor' && n.type === 'TEXT'), carro.motor);
      }

      figma.currentPage.selection = [container];
      figma.viewport.scrollAndZoomIntoView([container]);
      figma.closePlugin(`✅ ${carCards.length} Car Cards preenchidos com sucesso!`);
    })
    .catch(err => {
      figma.closePlugin('❌ Erro ao buscar carros: ' + err.message);
    });
}