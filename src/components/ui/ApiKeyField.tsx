import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from './Button';
import { Input } from './Input';

/**
 * Secure entry for the Anthropic API key, with an explicit paste button.
 *
 * The field is `secureTextEntry`, and a key is ~100 characters nobody types by
 * hand — so relying on the keyboard's paste menu (or Cmd-V in the Simulator,
 * which needs hardware-keyboard + pasteboard sync both on) is the difference
 * between usable and not. The button reads the clipboard directly.
 *
 * The key is never rendered back, here or in the confirmation line: the whole
 * point of the secure field is that it doesn't appear on screen. Feedback is a
 * length + a shape check instead.
 */

const ANTHROPIC_KEY_PREFIX = 'sk-ant-';

export interface ApiKeyFieldProps {
  /** Receives the trimmed key. The field clears itself once this resolves. */
  onSave: (key: string) => Promise<void> | void;
  saveTitle?: string;
}

export function ApiKeyField({ onSave, saveTitle = 'Save key' }: ApiKeyFieldProps) {
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [noteIsWarning, setNoteIsWarning] = useState(false);
  const [busy, setBusy] = useState(false);

  const pasteFromClipboard = useCallback(async () => {
    const clip = (await Clipboard.getStringAsync()).trim();
    if (clip.length === 0) {
      setNote('Clipboard is empty — copy your key first.');
      setNoteIsWarning(true);
      return;
    }
    setValue(clip);
    if (clip.startsWith(ANTHROPIC_KEY_PREFIX)) {
      setNote(`Pasted ${clip.length} characters.`);
      setNoteIsWarning(false);
    } else {
      setNote(
        `Pasted ${clip.length} characters, but it doesn't start with "${ANTHROPIC_KEY_PREFIX}" — check you copied the right thing.`,
      );
      setNoteIsWarning(true);
    }
  }, []);

  const save = useCallback(async () => {
    const key = value.trim();
    if (key.length === 0) return;
    setBusy(true);
    try {
      await onSave(key);
      setValue('');
      setNote('');
      setNoteIsWarning(false);
    } finally {
      setBusy(false);
    }
  }, [onSave, value]);

  return (
    <View>
      <Input
        placeholder="sk-ant-..."
        value={value}
        onChangeText={(next) => {
          setValue(next);
          setNote('');
        }}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />
      {note ? (
        <Text className={`text-xs mt-1 ${noteIsWarning ? 'text-accent-rust' : 'text-ink-muted'}`}>
          {note}
        </Text>
      ) : null}
      <View className="mt-3 gap-2">
        <Button title={saveTitle} onPress={save} disabled={busy || value.trim().length === 0} />
        <Button
          title="Paste from clipboard"
          variant="ghost"
          onPress={pasteFromClipboard}
          disabled={busy}
        />
      </View>
    </View>
  );
}
