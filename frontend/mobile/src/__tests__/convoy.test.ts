import { convoyMapPoints, type ConvoyState, updateConvoyPosition } from '../services/convoy';

const state: ConvoyState = {
  enabled: true,
  profile: { userId: 1, name: 'Lider', contactId: 'RT-1' },
  connections: [],
  invites: [],
  convoy: {
    id: 'comboio-1',
    ownerId: 1,
    members: [
      { userId: 1, name: 'Lider', status: 'ACCEPTED', latitude: -19.47, longitude: -42.54 },
      { userId: 2, name: 'Acompanhante', status: 'ACCEPTED' }
    ]
  }
};

describe('mapa do comboio', () => {
  it('adiciona ao mapa a posicao ao vivo recebida de outro participante', () => {
    const updated = updateConvoyPosition(state, {
      userId: 2,
      name: 'Acompanhante',
      latitude: -19.48,
      longitude: -42.55,
      heading: 90,
      timestamp: 1234
    });

    expect(convoyMapPoints(updated)).toEqual([
      {
        id: 'convoy-2',
        latitude: -19.48,
        longitude: -42.55,
        kind: 'convoy',
        label: 'Acompanhante'
      }
    ]);
  });

  it('nao duplica o proprio veiculo nem inventa posicao ausente', () => {
    expect(convoyMapPoints(state)).toEqual([]);
  });
});
