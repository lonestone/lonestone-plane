/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CycleIcon, IntakeIcon, ModuleIcon, PageIcon, ViewsIcon } from "@plane/propel/icons";
import { Button } from "@plane/propel/button";
import { CustomSelect, Input, ToggleSwitch } from "@plane/ui";
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import type { TCreateProjectTemplateFormValues } from "./create-project-template-form";

const FEATURE_FIELDS = [
  {
    key: "cycles",
    property: "cycle_view" as const,
    title: "Cycles",
    description: "Timebox work as you see fit per project and change frequency from one period to the next.",
    icon: <CycleIcon className="h-5 w-5 shrink-0 rotate-180 text-tertiary" />,
  },
  {
    key: "modules",
    property: "module_view" as const,
    title: "Modules",
    description: "Group work into sub-project-like set-ups with their own leads and assignees.",
    icon: <ModuleIcon width={20} height={20} className="shrink-0 text-tertiary" />,
  },
  {
    key: "views",
    property: "issue_views_view" as const,
    title: "Views",
    description: "Save sorts, filters, and display options for later or share them.",
    icon: <ViewsIcon className="h-5 w-5 shrink-0 text-tertiary" />,
  },
  {
    key: "pages",
    property: "page_view" as const,
    title: "Pages",
    description: "Write anything like you write anything.",
    icon: <PageIcon className="h-5 w-5 shrink-0 text-tertiary" />,
  },
  {
    key: "intake",
    property: "inbox_view" as const,
    title: "Intake",
    description: "Consider and discuss work items before you add them to your project.",
    icon: <IntakeIcon className="h-5 w-5 shrink-0 text-tertiary" />,
  },
];

const STATE_GROUP_OPTIONS = Object.values(STATE_GROUPS).map((group) => ({
  value: group.key,
  label: group.label,
}));

function SnapshotListSection(props: {
  title: string;
  emptyDescription: string;
  onAdd: () => void;
  addLabel: string;
  children: React.ReactNode;
  isEmpty: boolean;
}) {
  const { title, emptyDescription, onAdd, addLabel, children, isEmpty } = props;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-primary">{title}</h4>
        <Button variant="secondary" size="sm" type="button" onClick={onAdd}>
          <Plus className="size-3.5" />
          {addLabel}
        </Button>
      </div>
      {isEmpty ? (
        <p className="text-xs text-tertiary">{emptyDescription}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

export function ProjectTemplateSnapshotFields() {
  const { t } = useTranslation();
  const { control } = useFormContext<TCreateProjectTemplateFormValues>();

  const states = useFieldArray({ control, name: "states" });
  const labels = useFieldArray({ control, name: "labels" });
  const workItems = useFieldArray({ control, name: "work_items" });

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-primary">{t("projects_and_issues")}</h4>
        <div className="flex flex-col gap-3">
          {FEATURE_FIELDS.map((feature) => (
            <SettingsBoxedControlItem
              key={feature.key}
              title={
                <span className="flex items-center gap-2">
                  {feature.icon}
                  {feature.title}
                </span>
              }
              description={feature.description}
              control={
                <Controller
                  control={control}
                  name={feature.property}
                  render={({ field: { value, onChange } }) => (
                    <ToggleSwitch value={Boolean(value)} onChange={onChange} size="sm" />
                  )}
                />
              }
            />
          ))}
        </div>
      </div>

      <SnapshotListSection
        title={t("common.states")}
        emptyDescription={t("settings_empty_state.workflows.states.description")}
        addLabel={t("common.add")}
        isEmpty={states.fields.length === 0}
        onAdd={() =>
          states.append({
            name: "",
            color: STATE_GROUPS.unstarted.color,
            group: STATE_GROUPS.unstarted.key,
            sequence: 15000,
            default: states.fields.length === 0,
          })
        }
      >
        {states.fields.map((field, index) => (
          <div key={field.id} className="flex flex-wrap items-center gap-2 rounded-md border border-subtle p-2">
            <Controller
              control={control}
              name={`states.${index}.color`}
              render={({ field: { value, onChange } }) => (
                <input
                  type="color"
                  value={value || "#3f76ff"}
                  onChange={(e) => onChange(e.target.value)}
                  className="size-7 cursor-pointer rounded border border-subtle bg-transparent"
                  aria-label="State color"
                />
              )}
            />
            <Controller
              control={control}
              name={`states.${index}.name`}
              rules={{ required: true }}
              render={({ field: { value, onChange } }) => (
                <Input value={value} onChange={onChange} placeholder={t("name")} className="min-w-40 flex-1" />
              )}
            />
            <Controller
              control={control}
              name={`states.${index}.group`}
              render={({ field: { value, onChange } }) => (
                <CustomSelect
                  value={value}
                  onChange={onChange}
                  label={STATE_GROUP_OPTIONS.find((option) => option.value === value)?.label || t("select")}
                  buttonClassName="h-8"
                >
                  {STATE_GROUP_OPTIONS.map((option) => (
                    <CustomSelect.Option key={option.value} value={option.value}>
                      {option.label}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              )}
            />
            <button
              type="button"
              className="hover:text-danger rounded p-2 text-tertiary hover:bg-layer-1"
              onClick={() => states.remove(index)}
              aria-label={t("delete")}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </SnapshotListSection>

      <SnapshotListSection
        title={t("common.labels")}
        emptyDescription={t("templates.empty_state.no_labels.description")}
        addLabel={t("common.add")}
        isEmpty={labels.fields.length === 0}
        onAdd={() => labels.append({ name: "", color: "#858e96", description: "" })}
      >
        {labels.fields.map((field, index) => (
          <div key={field.id} className="flex flex-wrap items-center gap-2 rounded-md border border-subtle p-2">
            <Controller
              control={control}
              name={`labels.${index}.color`}
              render={({ field: { value, onChange } }) => (
                <input
                  type="color"
                  value={value || "#858e96"}
                  onChange={(e) => onChange(e.target.value)}
                  className="size-7 cursor-pointer rounded border border-subtle bg-transparent"
                  aria-label="Label color"
                />
              )}
            />
            <Controller
              control={control}
              name={`labels.${index}.name`}
              rules={{ required: true }}
              render={({ field: { value, onChange } }) => (
                <Input value={value} onChange={onChange} placeholder={t("name")} className="min-w-40 flex-1" />
              )}
            />
            <button
              type="button"
              className="hover:text-danger rounded p-2 text-tertiary hover:bg-layer-1"
              onClick={() => labels.remove(index)}
              aria-label={t("delete")}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </SnapshotListSection>

      <SnapshotListSection
        title={t("common.work_items")}
        emptyDescription={t("templates.empty_state.no_work_items.description")}
        addLabel={t("common.add")}
        isEmpty={workItems.fields.length === 0}
        onAdd={() => workItems.append({ name: "", description_html: "<p></p>" })}
      >
        {workItems.fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-2 rounded-md border border-subtle p-2">
            <Controller
              control={control}
              name={`work_items.${index}.name`}
              rules={{ required: true }}
              render={({ field: { value, onChange } }) => (
                <Input value={value} onChange={onChange} placeholder={t("title")} className="min-w-40 flex-1" />
              )}
            />
            <button
              type="button"
              className="hover:text-danger rounded p-2 text-tertiary hover:bg-layer-1"
              onClick={() => workItems.remove(index)}
              aria-label={t("delete")}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </SnapshotListSection>
    </div>
  );
}
