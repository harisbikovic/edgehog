/*
  This file is part of Edgehog.

  Copyright 2021-2023 SECO Mind Srl

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
*/

import { it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "setupTests";
import ConnectionStatus from "./ConnectionStatus";

it("renders connected status correctly", () => {
  renderWithProviders(<ConnectionStatus connected={true} icon />);

  expect(screen.getByText("Connected")).toBeVisible();
  expect(screen.getByRole("img", { hidden: true })).toHaveClass("text-success");
});

it("renders disconnected status correctly", () => {
  renderWithProviders(<ConnectionStatus connected={false} icon />);

  expect(screen.getByText("Disconnected")).toBeVisible();
  expect(screen.getByRole("img", { hidden: true })).toHaveClass(
    "text-secondary",
  );
});

it("renders icon if no value is specified", () => {
  renderWithProviders(<ConnectionStatus connected={true} />);

  expect(screen.getByRole("img", { hidden: true })).toBeVisible();
});

it("does not render icon correctly", () => {
  renderWithProviders(<ConnectionStatus connected={true} icon={false} />);

  expect(screen.queryByRole("img", { hidden: true })).not.toBeInTheDocument();
});
