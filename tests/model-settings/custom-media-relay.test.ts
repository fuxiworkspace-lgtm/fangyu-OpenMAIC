import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CUSTOM_MEDIA_PRESETS } from '@/lib/config/preset-ids';
import { applyModelSettingsChange, modelSettingsView } from '@/lib/server/model-config/settings';
import { setDeploymentConfigForTests } from '@/lib/server/model-config/runtime';
import { resolveModelReference } from '@/lib/server/model-config/resolve-slot';
import { mediaConnectionFor } from '@/lib/server/model-config/media';

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
