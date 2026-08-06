/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { useProjectTemplates } from "@/plane-web/hooks/store/use-project-templates";

export type TProjectTemplateSelect = {
  disabled?: boolean;
  onClick?: () => void;
  onSelect?: (templateId: string | null) => void;
  selectedTemplateId?: string | null;
};

export const ProjectTemplateSelect = observer(function ProjectTemplateSelect(props: TProjectTemplateSelect) {
  const { disabled = false, onSelect, selectedTemplateId = null } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { templates, fetchTemplates, getTemplateById } = useProjectTemplates();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!workspaceSlug || loaded) return;
    void fetchTemplates(workspaceSlug.toString()).finally(() => setLoaded(true));
  }, [workspaceSlug, loaded, fetchTemplates]);

  const selected = selectedTemplateId ? getTemplateById(selectedTemplateId) : undefined;

  return (
    <CustomMenu
      customButton={
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "text-xs flex items-center gap-1 rounded-md bg-black/40 px-2.5 py-1.5 font-medium text-on-color backdrop-blur-sm",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <span className="max-w-40 truncate">{selected?.name || t("templates.dropdown.label.project")}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </button>
      }
      placement="bottom-start"
      closeOnSelect
      disabled={disabled}
    >
      <CustomMenu.MenuItem
        onClick={() => {
          onSelect?.(null);
        }}
      >
        {t("none")}
      </CustomMenu.MenuItem>
      {templates.map((template) => (
        <CustomMenu.MenuItem
          key={template.id}
          onClick={() => {
            onSelect?.(template.id);
          }}
        >
          <span className="truncate">{template.name}</span>
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
});
