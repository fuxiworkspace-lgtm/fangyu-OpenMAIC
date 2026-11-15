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

export function existingProtocol(preset?: string, baseUrl?: string): string {
  if (
    preset === 'custom-minimax-video' ||
    (preset === 'custom-xai-video' && baseUrl?.includes('metaso.cn/api/minimax'))
  )
    return 'custom-minimax-video';
  return 'custom-xai-video';
}

export function normalizeRelayBaseUrl(value: string, preset?: string): string {
  const trimmed = value
    .trim()
    .replace(/[\s\\]+$/, '')
    .replace(/\/+$/, '');
  return preset === 'custom-minimax-video'
    ? trimmed.replace(/\/v2(?:\/video_generation)?$/i, '')
    : trimmed;
}

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
  const [videoProtocol, setVideoProtocol] = useState(
    existingProtocol(entry?.provider?.preset, entry?.provider?.baseUrl),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const modelIsUrl = /^https?:\/\//i.test(model.trim());
  const existing = entry?.provider;
  const preset =
    capability === 'video' ? videoProtocol : (existing?.preset ?? CUSTOM_MEDIA_PRESETS[capability]);
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
          baseUrl: normalizeRelayBaseUrl(baseUrl, preset),
          models: [model.trim()],
          ...(key ? { apiKey: key } : {}),
        },
        view,
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBaseUrl(normalizeRelayBaseUrl(baseUrl, preset));
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
          : videoProtocol === 'custom-minimax-video'
            ? '/v2/video_generation'
            : '/videos/generations';
  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">
        {capability === 'video'
          ? videoProtocol === 'custom-minimax-video'
            ? '使用 MiniMax H3 V2 异步协议。'
            : '使用 xAI 兼容异步协议。'
          : '使用 OpenAI 兼容接口。'}{' '}
        请求路径：{endpoint}
      </p>
      {capability === 'video' && (
        <div className="space-y-2">
          <Label htmlFor="video-relay-protocol">接口协议</Label>
          <select
            id="video-relay-protocol"
            value={videoProtocol}
            onChange={(e) => setVideoProtocol(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="custom-minimax-video">秘塔 / MiniMax H3 V2</option>
            <option value="custom-xai-video">xAI 视频</option>
          </select>
        </div>
      )}
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
          onChange={(e) => {
            const value = e.target.value;
            setBaseUrl(value);
            if (!existing && capability === 'video' && value.includes('metaso.cn'))
              setVideoProtocol('custom-minimax-video');
          }}
          placeholder={
            capability === 'video' && videoProtocol === 'custom-minimax-video'
              ? 'https://metaso.cn/api/minimax'
              : 'https://api.example.com/v1'
          }
        />
      </div>
      <div className="space-y-2">
        <Label>模型 ID</Label>
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="请输入模型 ID"
          aria-invalid={modelIsUrl}
        />
        {modelIsUrl && (
          <p className="text-sm text-red-600">
            这里需要填写模型名称，不是网址。请把网址填在 Base URL 栏。
          </p>
        )}
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
          saving ||
          !slug ||
          !baseUrl.trim() ||
          !model.trim() ||
          modelIsUrl ||
          (!existing?.key?.set && !key)
        }
      >
        {saving ? '保存中…' : '保存并使用'}
      </Button>
    </div>
  );
}
