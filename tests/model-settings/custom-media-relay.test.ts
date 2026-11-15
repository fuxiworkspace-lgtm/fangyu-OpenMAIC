import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CUSTOM_MEDIA_PRESETS } from '@/lib/config/preset-ids';
import { applyModelSettingsChange, modelSettingsView } from '@/lib/server/model-config/settings';
import { setDeploymentConfigForTests } from '@/lib/server/model-config/runtime';
import { resolveModelReference } from '@/lib/server/model-config/resolve-slot';
import { mediaConnectionFor } from '@/lib/server/model-config/media';
import { serviceEntries } from '@/lib/model-settings/services';

beforeEach(() => setDeploymentConfigForTests({ layer: null, legacy: false, notices: [] }));
afterEach(() => setDeploymentConfigForTests());

describe('workspace media relays', () => {
  it.each(['image', 'video', 'tts', 'asr'] as const)(
    'saves and resolves a custom %s model',
    async (capability) => {
      const preset = CUSTOM_MEDIA_PRESETS[capability];
      expect(modelSettingsView(null).presets.some((p) => p.id === preset)).toBe(true);
      const config = await applyModelSettingsChange(null, {
        kind: 'provider',
        id: 'relay',
        preset,
        baseUrl: 'https://1.1.1.1/v1',
        apiKey: 'secret',
        models: ['my-model'],
      });
      const assigned = await applyModelSettingsChange(config, {
        kind: 'slots',
        set: { [capability]: 'relay:my-model' },
      });
      const view = modelSettingsView({ config: assigned, revision: 1, unreadableSecrets: [] });
      const saved = view.providers.find((provider) => provider.id === 'relay');
      expect(saved?.capabilities[capability]?.models.map((model) => model.id)).toEqual([
        'my-model',
      ]);
      expect(view.slots.find((slot) => slot.slot === capability)?.effective).toMatchObject({
        status: 'assigned',
        providerId: 'relay',
        modelId: 'my-model',
      });
      expect(
        serviceEntries(view, capability, []).find((entry) => entry.id === 'relay'),
      ).toMatchObject({
        state: 'workspace',
        registryId: {
          image: 'openai-image',
          video: 'grok-video',
          tts: 'openai-tts',
          asr: 'openai-whisper',
        }[capability],
      });
      const target = resolveModelReference('relay:my-model', capability, [
        { source: 'workspace', config: assigned },
      ]);
      const connection = await mediaConnectionFor(capability, target);
      expect(connection).toMatchObject({
        baseUrl: 'https://1.1.1.1/v1',
        modelId: 'my-model',
        managed: false,
        userEndpoint: true,
      });
    },
  );
  it('switches a saved video relay to MiniMax H3 while retaining its key and model', async () => {
    const original = await applyModelSettingsChange(null, {
      kind: 'provider',
      id: 'mita',
      preset: 'custom-xai-video',
      baseUrl: 'https://1.1.1.1/api/minimax',
      apiKey: 'secret',
      models: ['MiniMax-H3'],
    });
    const saved = await applyModelSettingsChange(original, {
      kind: 'provider',
      id: 'mita',
      preset: 'custom-minimax-video',
      baseUrl: 'https://1.1.1.1/api/minimax',
      models: ['MiniMax-H3'],
    });
    const assigned = await applyModelSettingsChange(saved, {
      kind: 'slots',
      set: { video: 'mita:MiniMax-H3' },
    });
    const target = resolveModelReference('mita:MiniMax-H3', 'video', [
      { source: 'workspace', config: assigned },
    ]);
    const connection = await mediaConnectionFor('video', target);
    expect(connection).toMatchObject({
      providerId: 'minimax-video',
      apiKey: 'secret',
      modelId: 'MiniMax-H3',
      managed: false,
      userEndpoint: true,
    });
    const view = modelSettingsView({ config: assigned, revision: 1, unreadableSecrets: [] });
    expect(view.providers.find((p) => p.id === 'mita')?.capabilities.video?.models[0]?.id).toBe(
      'MiniMax-H3',
    );
  });
  it('rejects private network endpoints', async () => {
    await expect(
      applyModelSettingsChange(null, {
        kind: 'provider',
        id: 'relay',
        preset: CUSTOM_MEDIA_PRESETS.image,
        baseUrl: 'http://127.0.0.1/v1',
        models: ['x'],
      }),
    ).rejects.toThrow();
  });
});
