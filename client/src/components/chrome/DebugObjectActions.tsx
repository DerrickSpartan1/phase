import { useState } from "react";

import type { CounterType, DebugAction, PlayerId, Zone } from "../../adapter/types";
import {
  AccordionItem,
  CheckboxInput,
  FieldRow,
  NumberInput,
  ObjectIdInput,
  PlayerSelect,
  SelectInput,
  SubmitButton,
  useAccordion,
} from "./debugFields";

const ZONES: readonly Zone[] = [
  "Battlefield",
  "Hand",
  "Graveyard",
  "Exile",
  "Library",
  "Stack",
  "Command",
] as const;

const COUNTER_TYPES: readonly CounterType[] = [
  "P1P1",
  "M1M1",
  "loyalty",
  "lore",
  "charge",
  "stun",
  "time",
  "fate",
  "quest",
  "verse",
] as const;

interface Props {
  onDispatch: (action: DebugAction) => void;
}

function MoveToZoneForm({ onDispatch }: Props) {
  const [objectId, setObjectId] = useState(0);
  const [toZone, setToZone] = useState<Zone>("Battlefield");
  const [simulate, setSimulate] = useState(false);

  return (
    <>
      <ObjectIdInput value={objectId} onChange={setObjectId} />
      <FieldRow label="To Zone">
        <SelectInput value={toZone} onChange={setToZone} options={ZONES} />
      </FieldRow>
      <CheckboxInput checked={simulate} onChange={setSimulate} label="Simulate (run triggers + SBAs)" />
      <SubmitButton
        onClick={() =>
          onDispatch({ type: "MoveToZone", data: { object_id: objectId, to_zone: toZone, simulate } })
        }
      >
        Move
      </SubmitButton>
    </>
  );
}

function RemoveObjectForm({ onDispatch }: Props) {
  const [objectId, setObjectId] = useState(0);

  return (
    <>
      <ObjectIdInput value={objectId} onChange={setObjectId} />
      <SubmitButton onClick={() => onDispatch({ type: "RemoveObject", data: { object_id: objectId } })}>
        Remove
      </SubmitButton>
    </>
  );
}

function SetBasePTForm({ onDispatch }: Props) {
  const [objectId, setObjectId] = useState(0);
  const [power, setPower] = useState(0);
  const [toughness, setToughness] = useState(0);

  return (
    <>
      <ObjectIdInput value={objectId} onChange={setObjectId} />
      <FieldRow label="Power">
        <NumberInput value={power} onChange={setPower} />
      </FieldRow>
      <FieldRow label="Toughness">
        <NumberInput value={toughness} onChange={setToughness} />
      </FieldRow>
      <SubmitButton
        onClick={() =>
          onDispatch({ type: "SetBasePowerToughness", data: { object_id: objectId, power, toughness } })
        }
      >
        Set P/T
      </SubmitButton>
    </>
  );
}

function ModifyCountersForm({ onDispatch }: Props) {
  const [objectId, setObjectId] = useState(0);
  const [counterType, setCounterType] = useState<CounterType>("P1P1");
  const [delta, setDelta] = useState(1);

  return (
    <>
      <ObjectIdInput value={objectId} onChange={setObjectId} />
      <FieldRow label="Counter">
        <SelectInput value={counterType} onChange={setCounterType} options={COUNTER_TYPES} />
      </FieldRow>
      <FieldRow label="Delta">
        <NumberInput value={delta} onChange={setDelta} />
      </FieldRow>
      <SubmitButton
        onClick={() =>
          onDispatch({ type: "ModifyCounters", data: { object_id: objectId, counter_type: counterType, delta } })
        }
      >
        Modify Counters
      </SubmitButton>
    </>
  );
}

function SetTappedForm({ onDispatch }: Props) {
  const [objectId, setObjectId] = useState(0);
  const [tapped, setTapped] = useState(true);

  return (
    <>
      <ObjectIdInput value={objectId} onChange={setObjectId} />
      <CheckboxInput checked={tapped} onChange={setTapped} label="Tapped" />
      <SubmitButton
        onClick={() => onDispatch({ type: "SetTapped", data: { object_id: objectId, tapped } })}
      >
        Set Tap State
      </SubmitButton>
    </>
  );
}

function SetControllerForm({ onDispatch }: Props) {
  const [objectId, setObjectId] = useState(0);
  const [controller, setController] = useState<PlayerId>(0);

  return (
    <>
      <ObjectIdInput value={objectId} onChange={setObjectId} />
      <FieldRow label="Controller">
        <PlayerSelect value={controller} onChange={setController} />
      </FieldRow>
      <SubmitButton
        onClick={() =>
          onDispatch({ type: "SetController", data: { object_id: objectId, controller } })
        }
      >
        Set Controller
      </SubmitButton>
    </>
  );
}

function SetSummoningSicknessForm({ onDispatch }: Props) {
  const [objectId, setObjectId] = useState(0);
  const [sick, setSick] = useState(false);

  return (
    <>
      <ObjectIdInput value={objectId} onChange={setObjectId} />
      <CheckboxInput checked={sick} onChange={setSick} label="Summoning Sick" />
      <SubmitButton
        onClick={() =>
          onDispatch({ type: "SetSummoningSickness", data: { object_id: objectId, sick } })
        }
      >
        Set Summoning Sickness
      </SubmitButton>
    </>
  );
}

function SetFaceStateForm({ onDispatch }: Props) {
  const [objectId, setObjectId] = useState(0);
  const [faceDown, setFaceDown] = useState(false);
  const [transformed, setTransformed] = useState(false);
  const [flipped, setFlipped] = useState(false);

  return (
    <>
      <ObjectIdInput value={objectId} onChange={setObjectId} />
      <CheckboxInput checked={faceDown} onChange={setFaceDown} label="Face Down" />
      <CheckboxInput checked={transformed} onChange={setTransformed} label="Transformed" />
      <CheckboxInput checked={flipped} onChange={setFlipped} label="Flipped" />
      <SubmitButton
        onClick={() =>
          onDispatch({
            type: "SetFaceState",
            data: { object_id: objectId, face_down: faceDown, transformed, flipped },
          })
        }
      >
        Set Face State
      </SubmitButton>
    </>
  );
}

function AttachForm({ onDispatch }: Props) {
  const [objectId, setObjectId] = useState(0);
  const [targetId, setTargetId] = useState(0);

  return (
    <>
      <ObjectIdInput value={objectId} onChange={setObjectId} label="Attach" />
      <ObjectIdInput value={targetId} onChange={setTargetId} label="To Target" />
      <SubmitButton
        onClick={() =>
          onDispatch({ type: "Attach", data: { object_id: objectId, target_id: targetId } })
        }
      >
        Attach
      </SubmitButton>
    </>
  );
}

function DetachForm({ onDispatch }: Props) {
  const [objectId, setObjectId] = useState(0);

  return (
    <>
      <ObjectIdInput value={objectId} onChange={setObjectId} />
      <SubmitButton onClick={() => onDispatch({ type: "Detach", data: { object_id: objectId } })}>
        Detach
      </SubmitButton>
    </>
  );
}

export function DebugObjectActions({ onDispatch }: Props) {
  const { expanded, toggle } = useAccordion();

  return (
    <div>
      <AccordionItem label="Move to Zone" expanded={expanded === "move"} onToggle={() => toggle("move")}>
        <MoveToZoneForm onDispatch={onDispatch} />
      </AccordionItem>
      <AccordionItem label="Remove Object" expanded={expanded === "remove"} onToggle={() => toggle("remove")}>
        <RemoveObjectForm onDispatch={onDispatch} />
      </AccordionItem>
      <AccordionItem label="Set Base P/T" expanded={expanded === "pt"} onToggle={() => toggle("pt")}>
        <SetBasePTForm onDispatch={onDispatch} />
      </AccordionItem>
      <AccordionItem label="Modify Counters" expanded={expanded === "counters"} onToggle={() => toggle("counters")}>
        <ModifyCountersForm onDispatch={onDispatch} />
      </AccordionItem>
      <AccordionItem label="Set Tapped" expanded={expanded === "tapped"} onToggle={() => toggle("tapped")}>
        <SetTappedForm onDispatch={onDispatch} />
      </AccordionItem>
      <AccordionItem label="Set Controller" expanded={expanded === "controller"} onToggle={() => toggle("controller")}>
        <SetControllerForm onDispatch={onDispatch} />
      </AccordionItem>
      <AccordionItem label="Summoning Sickness" expanded={expanded === "sick"} onToggle={() => toggle("sick")}>
        <SetSummoningSicknessForm onDispatch={onDispatch} />
      </AccordionItem>
      <AccordionItem label="Face State" expanded={expanded === "face"} onToggle={() => toggle("face")}>
        <SetFaceStateForm onDispatch={onDispatch} />
      </AccordionItem>
      <AccordionItem label="Attach" expanded={expanded === "attach"} onToggle={() => toggle("attach")}>
        <AttachForm onDispatch={onDispatch} />
      </AccordionItem>
      <AccordionItem label="Detach" expanded={expanded === "detach"} onToggle={() => toggle("detach")}>
        <DetachForm onDispatch={onDispatch} />
      </AccordionItem>
    </div>
  );
}
