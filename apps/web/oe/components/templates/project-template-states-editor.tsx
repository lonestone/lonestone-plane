/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IState, TProjectTemplateState, TStateGroups, TStateOperationsCallbacks } from "@plane/types";
import { GroupList } from "@/components/project-states";
import { SettingsHeading } from "@/components/settings/heading";
import type { TCreateProjectTemplateFormValues } from "./create-project-template-form";

const GROUP_KEYS = Object.keys(STATE_GROUPS) as TStateGroups[];

const createClientStateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tmpl-state-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const normalizeStates = (states: TProjectTemplateState[]): TProjectTemplateState[] =>
  states.map((state) => {
    const group = (state.group || STATE_GROUPS.backlog.key) as TStateGroups;
    return {
      id: state.id || createClientStateId(),
      name: state.name,
      description: state.description || "",
      color: state.color || STATE_GROUPS[group].color,
      group,
      sequence: state.sequence ?? 15000,
      default: Boolean(state.default),
    };
  });

const toIState = (state: TProjectTemplateState, index: number): IState => {
  const group = (state.group || STATE_GROUPS.backlog.key) as TStateGroups;
  return {
    id: state.id as string,
    name: state.name,
    color: state.color || STATE_GROUPS[group].color,
    group,
    sequence: state.sequence ?? (index + 1) * 1000,
    default: Boolean(state.default),
    description: state.description || "",
    project_id: "",
    workspace_id: "",
    order: index,
  };
};

const buildGroupedStates = (states: TProjectTemplateState[]): Record<TStateGroups, IState[]> => {
  const grouped = GROUP_KEYS.reduce(
    (acc, groupKey) => {
      acc[groupKey] = [];
      return acc;
    },
    {} as Record<TStateGroups, IState[]>
  );

  states.forEach((state, index) => {
    const groupKey = (state.group || STATE_GROUPS.backlog.key) as TStateGroups;
    if (!grouped[groupKey]) return;
    grouped[groupKey].push(toIState(state, index));
  });

  GROUP_KEYS.forEach((groupKey) => {
    grouped[groupKey].sort((a, b) => a.sequence - b.sequence);
  });

  return grouped;
};

export function ProjectTemplateStatesEditor() {
  const { t } = useTranslation();
  const { watch, setValue, getValues } = useFormContext<TCreateProjectTemplateFormValues>();
  const states = watch("states");

  useEffect(() => {
    const current = getValues("states") ?? [];
    if (!current.some((state) => !state.id)) return;
    setValue("states", normalizeStates(current), { shouldDirty: false });
  }, [getValues, setValue, states]);

  const setStates = (nextStates: TProjectTemplateState[]) => {
    setValue("states", normalizeStates(nextStates), { shouldDirty: true });
  };

  const groupedStates = useMemo(() => buildGroupedStates(states ?? []), [states]);

  const stateOperationsCallbacks: TStateOperationsCallbacks = useMemo(
    () => ({
      createState: async (data) => {
        const current = normalizeStates(getValues("states") ?? []);
        const name = (data.name || "").trim();
        if (!name) throw { status: 400, data: { error: "Name is required" } };
        if (current.some((state) => state.name.toLowerCase() === name.toLowerCase())) {
          throw { status: 400, data: { error: "State with that name already exists" } };
        }

        const group = (data.group || STATE_GROUPS.unstarted.key) as TStateGroups;
        const groupStates = current.filter((state) => state.group === group);
        const nextState: TProjectTemplateState = {
          id: createClientStateId(),
          name,
          description: data.description || "",
          color: data.color || STATE_GROUPS[group].color,
          group,
          sequence: data.sequence ?? (groupStates.length + 1) * 10000,
          default: current.length === 0,
        };
        setStates([...current, nextState]);
        return toIState(nextState, current.length);
      },
      updateState: async (stateId, data) => {
        const current = normalizeStates(getValues("states") ?? []);
        const index = current.findIndex((state) => state.id === stateId);
        if (index < 0) return undefined;

        const name = data.name !== undefined ? data.name.trim() : current[index].name;
        if (name && current.some((state, i) => i !== index && state.name.toLowerCase() === name.toLowerCase())) {
          throw { status: 400 };
        }

        const next = current.slice();
        next[index] = Object.assign({}, current[index], data, {
          name: name || current[index].name,
        });
        setStates(next);
        return toIState(next[index], index);
      },
      deleteState: async (stateId) => {
        const current = normalizeStates(getValues("states") ?? []);
        const target = current.find((state) => state.id === stateId);
        if (!target || target.default) return;
        setStates(current.filter((state) => state.id !== stateId));
      },
      moveStatePosition: async (stateId, data) => {
        const current = normalizeStates(getValues("states") ?? []);
        const index = current.findIndex((state) => state.id === stateId);
        if (index < 0) return;
        const next = current.slice();
        next[index] = Object.assign({}, next[index], {
          group: (data.group as string) || next[index].group,
          sequence: data.sequence ?? next[index].sequence,
        });
        setStates(next);
      },
      markStateAsDefault: async (stateId) => {
        const current = normalizeStates(getValues("states") ?? []);
        setStates(current.map((state) => Object.assign({}, state, { default: state.id === stateId })));
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form helpers
    [getValues]
  );

  return (
    <div className="w-full space-y-6">
      <SettingsHeading
        title={t("project_settings.states.heading")}
        description={t("project_settings.states.description")}
      />
      <GroupList
        groupedStates={groupedStates}
        stateOperationsCallbacks={stateOperationsCallbacks}
        isEditable
        shouldTrackEvents={false}
      />
    </div>
  );
}
