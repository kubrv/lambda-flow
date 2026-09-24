import { useState } from "react";
import { resolvePresetStart } from "../../lib/labels";
import type { AppData } from "../../lib/types";
import {
  AddressLookupField,
  type ResolvedPlace,
} from "./AddressLookupField";

type Props = {
  data: AppData;
  onChange: (next: AppData) => void;
};

export function ValuesAdmin({ data, onChange }: Props) {
  const seed = resolvePresetStart(data);
  const [resolved, setResolved] = useState<ResolvedPlace | null>(() =>
    seed.address.trim() && seed.lat != null && seed.lng != null
      ? {
          address: seed.address.trim(),
          lat: seed.lat,
          lng: seed.lng,
        }
      : null,
  );
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function save() {
    setErr("");
    if (
      !resolved?.address.trim() ||
      resolved.lat == null ||
      resolved.lng == null ||
      Number.isNaN(resolved.lat) ||
      Number.isNaN(resolved.lng)
    ) {
      setErr("Busque e confirme o endereço no mapa antes de salvar.");
      return;
    }
    onChange({
      ...data,
      presetStartAddress: resolved.address.trim(),
      presetStartLat: resolved.lat,
      presetStartLng: resolved.lng,
    });
    setMsg("Partida padrão salva com ponto no mapa.");
  }

  return (
    <section className="panel">
      <h2>Partida padrão</h2>
      <p className="lede">
        Endereço de partida usado em novas rotas. Busque como no cadastro de
        endereços (rua/número ou link do Maps) e confirme o ponto. O valor por
        km fica no perfil de cada motoboy.
      </p>

      <div className="form-grid">
        <div className="field">
          <label>Partida padrão</label>
          <AddressLookupField
            idPrefix="preset-start"
            initialAddress={seed.address}
            initialLat={seed.lat}
            initialLng={seed.lng}
            resetKey={seed.address}
            onResolved={setResolved}
          />
        </div>

        {resolved?.address ? (
          <p className="hint">
            Selecionado: <strong>{resolved.address}</strong>
          </p>
        ) : null}

        <div className="row-actions">
          <button type="button" className="btn primary" onClick={save}>
            Salvar partida
          </button>
        </div>
        {err ? <div className="status err">{err}</div> : null}
        {msg ? <div className="status ok">{msg}</div> : null}
      </div>
    </section>
  );
}
