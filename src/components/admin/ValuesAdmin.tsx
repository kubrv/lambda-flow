import { useState } from "react";
import { resolvePresetStart } from "../../lib/labels";
import type { AppData } from "../../lib/types";

type Props = {
  data: AppData;
  onChange: (next: AppData) => void;
};

export function ValuesAdmin({ data, onChange }: Props) {
  const [preset, setPreset] = useState(
    data.presetStartAddress || resolvePresetStart(data).address,
  );
  const [msg, setMsg] = useState("");

  function save() {
    onChange({
      ...data,
      presetStartAddress: preset.trim() || data.presetStartAddress,
      presetStartLat: null,
      presetStartLng: null,
    });
    setMsg("Partida padrão salva. O valor/km fica no perfil de cada motoboy.");
  }

  return (
    <section className="panel">
      <h2>Partida padrão</h2>
      <p className="lede">
        Endereço de partida usado em novos cadastros. O valor por km agora é
        definido no perfil de cada motoboy (aba Motoboys).
      </p>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="preset">Partida padrão</label>
          <textarea
            id="preset"
            rows={3}
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          />
        </div>

        <div className="row-actions">
          <button type="button" className="btn primary" onClick={save}>
            Salvar partida
          </button>
        </div>
        {msg ? <div className="status ok">{msg}</div> : null}
      </div>
    </section>
  );
}
