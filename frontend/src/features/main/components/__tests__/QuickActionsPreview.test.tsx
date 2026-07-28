import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import QuickActionsPreview from "../QuickActionsPreview";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("features/main/components/QuickActionsPreview", () => {
  const navigation = {
    navigate: jest.fn(),
  } as any;

  const productionUnitContext = {
    cycleId: "cycle-1",
    cycleUnitAllocationId: "allocation-1",
    productionUnitId: "unit-1",
    productionUnitName: "Bac 1",
  };

  const incompleteProductionUnitContext = {
    cycleId: "cycle-1",
    cycleUnitAllocationId: "",
    productionUnitId: "unit-1",
    productionUnitName: "Bac 1",
  } as any;

  it("refuse un contexte unitaire incomplet", () => {
    const { queryByText, getByText } = render(
      <QuickActionsPreview
        onOpenSheet={jest.fn()}
        hasActiveCycles
        unreadCount={0}
        navigation={navigation}
        scope="unit"
        productionUnitContext={incompleteProductionUnitContext}
      />,
    );

    expect(queryByText("dailyLogCompact")).toBeNull();
    expect(queryByText("sanitaryLogCompact")).toBeNull();
    expect(queryByText("productionUnitLogHistoryAction")).toBeNull();
    expect(getByText("viewAllActions")).toBeTruthy();
  });

  it("affiche Plan d alimentation en mode unite", () => {
    const onOpenSheet = jest.fn();
    const { getByLabelText, getByText } = render(
      <QuickActionsPreview
        onOpenSheet={onOpenSheet}
        hasActiveCycles
        unreadCount={0}
        navigation={navigation}
        scope="unit"
        productionUnitContext={productionUnitContext}
      />,
    );

    expect(getByText("feedingPlanCompact")).toBeTruthy();

    const action = getByLabelText("dailyLogCompact");
    const viewAll = getByLabelText("viewAllActions");

    expect(StyleSheet.flatten(action.props.style)).toMatchObject({
      flexDirection: "row",
      alignItems: "center",
    });
    expect(StyleSheet.flatten(viewAll.props.style)).toMatchObject({
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    });

    fireEvent.press(viewAll);
    expect(onOpenSheet).toHaveBeenCalledTimes(1);
  });

  it("masque les actions globales opérationnelles pour un cycle avec unités", () => {
    const { queryByText, getByText } = render(
      <QuickActionsPreview
        onOpenSheet={jest.fn()}
        hasActiveCycles
        unreadCount={0}
        navigation={navigation}
        scope="cycle"
        hideGlobalCycleOperationalActions
      />,
    );

    expect(queryByText("dailyLog")).toBeNull();
    expect(getByText("reports")).toBeTruthy();
    expect(getByText("productCatalog")).toBeTruthy();
    expect(getByText("notifications")).toBeTruthy();
  });
});
