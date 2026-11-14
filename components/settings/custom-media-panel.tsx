'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CUSTOM_MEDIA_PRESETS } from '@/lib/config/preset-ids';
import { modelChange, modelRef, newProviderId } from '@/lib/model-settings/edit';
import type { SlotCapability } from '@/lib/config/model-slots';
import type { ApplyChange, ModelSettingsView } from '@/lib/model-settings/client';
import type { ServiceEntry } from '@/lib/model-settings/services';
import { reportApply, rootUse } from './server-settings';
import { useI18n } from '@/lib/hooks/use-i18n';

export function CustomMediaPanel({
  view,
  apply,
  capability,
  entry,
  onSaved,
}: {
  view: ModelSettingsView;
  apply: ApplyChange;
  capability: SlotCapability;
  entry?: ServiceEntry;
  onSaved: (id: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(entry?.id ?? '');
  const [baseUrl, setBaseUrl] = useState(entry?.provider?.baseUrl ?? '');
  const [model, setModel] = useState(entry?.provider?.models?.[0] ?? '');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const existing = entry?.provider;
  const preset = existing?.preset ?? CUSTOM_MEDIA_PRESETS[capability];
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const save = async () => {
    if (!slug || !baseUrl.trim() || !model.trim() || !preset) return;
    setSaving(true);
    setError('');
    try {
      const id = existing?.id ?? newProviderId(view, slug);
      const result = await apply(
        {
          kind: 'provider',
          id,
          preset,
          baseUrl: baseUrl.trim().replace(/\/+$/, ''),
          models: [model.trim()],
          ...(key ? { apiKey: key } : {}),
        },
        view,
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const slot = rootUse(result.view, capability, id).slot;
      if (slot && !slot.locked) {
        const assigned = await apply(modelChange(slot, modelRef(id, model.trim())), result.view);
        if (!reportApply(assigned, t)) return;
      }
      setKey('');
      onSaved(id);
    } finally {
      setSaving(false);
    }
  };
  const endpoint =
    capability === 'image'
      ? '/images/generations'
      : capability === 'tts'
        ? '/audio/speech'
        : capability === 'asr'
          ? '/audio/transcriptions'
          : '/videos/generations';
  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">
        {capability === 'video'
          ? '视频使用 xAI 兼容的异步接口：提交后通过 /videos/{request_id} 查询。'
          : '使用 OpenAI 兼容接口。'}{' '}
        请求路径：{endpoint}
      </p>
      <div className="space-y-2">
        <Label>服务名称（英文或数字）</Label>
        <Input
          value={name}
          disabled={!!existing}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-relay"
        />
      </div>
      <div className="space-y-2">
        <Label>Base URL</Label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.example.com/v1"
        />
      </div>
      <div className="space-y-2">
        <Label>模型 ID</Label>
        <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model-id" />
      </div>
      <div className="space-y-2">
        <Label>API Key {existing?.key?.set ? '（已保存，留空保持不变）' : ''}</Label>
        <Input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      {error && <p className="text-sm text-red-600 break-all">{error}</p>}
      <Button
        onClick={() => void save()}
        disabled={
          saving || !slug || !baseUrl.trim() || !model.trim() || (!existing?.key?.set && !key)
        }
      >
        {saving ? '保存中…' : '保存并使用'}
      </Button>
    </div>
  );
}
