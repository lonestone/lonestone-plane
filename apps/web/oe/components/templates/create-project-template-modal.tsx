/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { TProjectTemplate } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import useKeypress from "@/hooks/use-keypress";
import { CreateProjectTemplateForm } from "./create-project-template-form";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  onSuccess?: () => void;
  template?: TProjectTemplate | null;
};

export const CreateProjectTemplateModal = observer(function CreateProjectTemplateModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, onSuccess, template = null } = props;

  useKeypress("Escape", () => {
    if (isOpen) onClose();
  });

  return (
    <ModalCore isOpen={isOpen} position={EModalPosition.TOP} width={EModalWidth.XXXXL}>
      {isOpen && (
        <CreateProjectTemplateForm
          workspaceSlug={workspaceSlug}
          onClose={onClose}
          onSuccess={onSuccess}
          template={template}
        />
      )}
    </ModalCore>
  );
});
