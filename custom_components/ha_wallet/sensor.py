"""Sensor platform for Wallet by BudgetBakers (M1 read core).

Entities are built once from the first coordinator snapshot: one balance sensor
per selected account, one total per currency, one per selected budget, plus the
portfolio aggregates (cash flow, spending, spending by cardinality), the recent
records list and a best-effort credit-utilization sensor. Adding a new account
or budget in Wallet is picked up on the next reload of the entry.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .aggregation import percent_change
from .const import (
    ATTR_ACCOUNT_ID,
    ATTR_ACCOUNT_IDS,
    ATTR_ACCOUNT_TYPE,
    ATTR_AVAILABLE,
    ATTR_BANK_SYNCED,
    ATTR_BUDGET_ID,
    ATTR_BY_CATEGORY,
    ATTR_CATEGORIES,
    ATTR_CATEGORY_IDS,
    ATTR_CREDIT_BALANCE,
    ATTR_CURRENCY,
    ATTR_DESIRED_DATE,
    ATTR_EXPENSE,
    ATTR_GOAL_STATE,
    ATTR_INCOME,
    ATTR_INITIAL_AMOUNT,
    ATTR_LABELS,
    ATTR_LAST_CHANGE,
    ATTR_LIMIT,
    ATTR_ORDERS,
    ATTR_PERIOD,
    ATTR_RECORDS,
    ATTR_REMAINING,
    ATTR_RESET_AT,
    ATTR_RULES,
    ATTR_TOTAL_CREDIT_LIMIT,
    ATTR_VS_PREVIOUS_PCT,
    ATTRIBUTION,
    CONF_BUDGET_IDS,
    CREDIT_ACCOUNT_TYPES,
    DOMAIN,
    MANUFACTURER,
    NAME,
)
from .coordinator import WalletData, WalletDataUpdateCoordinator

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Wallet sensors, adding per-item ones dynamically as they appear.

    Singleton sensors are created once. Per-account / per-currency / per-budget /
    per-goal sensors are (re)discovered on every coordinator update, so items
    created through the management services show up without a reload.
    """
    coordinator: WalletDataUpdateCoordinator = entry.runtime_data.coordinator

    async_add_entities(
        [
            WalletCashFlowSensor(coordinator, entry),
            WalletSpendingSensor(coordinator, entry),
            WalletSpendingByCardinalitySensor(coordinator, entry),
            WalletLastRecordsSensor(coordinator, entry),
            WalletCreditUtilizationSensor(coordinator, entry),
            WalletApiUsageSensor(coordinator, entry),
            WalletStandingOrdersSensor(coordinator, entry),
            WalletRecordRulesSensor(coordinator, entry),
            WalletCategoriesSensor(coordinator, entry),
            WalletLabelsSensor(coordinator, entry),
        ]
    )

    known_accounts: set[str] = set()
    known_currencies: set[str] = set()
    known_budgets: set[str] = set()
    known_goals: set[str] = set()

    @callback
    def _discover() -> None:
        data = coordinator.data
        if data is None:
            return
        new: list[CoordinatorEntity] = []
        selected_accounts = coordinator._selected_account_ids(data.accounts)
        tracked = [a for a in data.accounts if str(a.get("id")) in selected_accounts]

        for account in tracked:
            aid = str(account.get("id"))
            if aid not in known_accounts:
                known_accounts.add(aid)
                new.append(WalletAccountSensor(coordinator, entry, aid))

        for currency in {_account_balance(a).get("currencyCode") for a in tracked}:
            if currency and currency not in known_currencies:
                known_currencies.add(currency)
                new.append(WalletBalanceByCurrencySensor(coordinator, entry, currency))

        selected_budgets = entry.options.get(CONF_BUDGET_IDS)
        for budget in data.budgets:
            bid = str(budget.get("id"))
            if budget.get("id") is None or bid in known_budgets:
                continue
            if selected_budgets and bid not in selected_budgets:
                continue
            known_budgets.add(bid)
            new.append(WalletBudgetSensor(coordinator, entry, bid))

        for goal in data.goals:
            gid = goal.get("id")
            if gid is not None and str(gid) not in known_goals:
                known_goals.add(str(gid))
                new.append(WalletGoalSensor(coordinator, entry, str(gid)))

        if new:
            async_add_entities(new)

    _discover()
    entry.async_on_unload(coordinator.async_add_listener(_discover))


def _account_balance(account: Mapping[str, Any]) -> Mapping[str, Any]:
    """Return an account's balance sub-object, or an empty mapping."""
    balance = account.get("balance")
    return balance if isinstance(balance, Mapping) else {}


class WalletBaseSensor(CoordinatorEntity[WalletDataUpdateCoordinator], SensorEntity):
    """Common wiring: device, attribution, entity-name behaviour."""

    _attr_has_entity_name = True
    _attr_attribution = ATTRIBUTION

    def __init__(
        self, coordinator: WalletDataUpdateCoordinator, entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=NAME,
            manufacturer=MANUFACTURER,
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def _wallet(self) -> WalletData:
        return self.coordinator.data


class _MoneySensor(WalletBaseSensor):
    """Base for monetary sensors (device_class monetary → state_class total)."""

    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_suggested_display_precision = 2


# --- per-account -------------------------------------------------------------


class WalletAccountSensor(_MoneySensor):
    """Balance of a single account, in its own currency."""

    def __init__(
        self,
        coordinator: WalletDataUpdateCoordinator,
        entry: ConfigEntry,
        account_id: str,
    ) -> None:
        super().__init__(coordinator, entry)
        self._account_id = account_id
        self._attr_unique_id = f"{entry.entry_id}_account_{account_id}"
        name = self._account().get("name") or account_id
        self._attr_name = f"Account {name}"

    def _account(self) -> Mapping[str, Any]:
        for account in self._wallet.accounts:
            if str(account.get("id")) == self._account_id:
                return account
        return {}

    @property
    def native_value(self) -> float | None:
        balance = _account_balance(self._account())
        return balance.get("currentBalance")

    @property
    def native_unit_of_measurement(self) -> str | None:
        return _account_balance(self._account()).get("currencyCode")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        account = self._account()
        balance = _account_balance(account)
        return {
            ATTR_ACCOUNT_ID: self._account_id,
            ATTR_ACCOUNT_TYPE: account.get("accountType"),
            ATTR_CURRENCY: balance.get("currencyCode"),
            ATTR_BANK_SYNCED: account.get("isBankSync"),
            ATTR_LAST_CHANGE: account.get("updatedAt"),
        }


class WalletBalanceByCurrencySensor(_MoneySensor):
    """Total balance of all tracked accounts sharing one currency."""

    def __init__(
        self,
        coordinator: WalletDataUpdateCoordinator,
        entry: ConfigEntry,
        currency: str,
    ) -> None:
        super().__init__(coordinator, entry)
        self._currency = currency
        self._attr_unique_id = f"{entry.entry_id}_balance_{currency}"
        self._attr_name = f"Balance {currency}"
        self._attr_native_unit_of_measurement = currency

    def _matching_accounts(self) -> list[Mapping[str, Any]]:
        selected = self.coordinator._selected_account_ids(self._wallet.accounts)
        return [
            a
            for a in self._wallet.accounts
            if str(a.get("id")) in selected
            and _account_balance(a).get("currencyCode") == self._currency
        ]

    @property
    def native_value(self) -> float | None:
        total = 0.0
        seen = False
        for account in self._matching_accounts():
            value = _account_balance(account).get("currentBalance")
            if value is not None:
                total += float(value)
                seen = True
        return round(total, 2) if seen else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            ATTR_ACCOUNT_IDS: [str(a.get("id")) for a in self._matching_accounts()],
            ATTR_CURRENCY: self._currency,
        }


# --- per-budget --------------------------------------------------------------


class WalletBudgetSensor(_MoneySensor):
    """Amount spent against a budget for the current period (API-computed)."""

    def __init__(
        self,
        coordinator: WalletDataUpdateCoordinator,
        entry: ConfigEntry,
        budget_id: str,
    ) -> None:
        super().__init__(coordinator, entry)
        self._budget_id = budget_id
        self._attr_unique_id = f"{entry.entry_id}_budget_{budget_id}"
        self._attr_name = f"Budget {self._budget().get('name') or budget_id}"

    def _budget(self) -> Mapping[str, Any]:
        for budget in self._wallet.budgets:
            if str(budget.get("id")) == self._budget_id:
                return budget
        return {}

    def _current(self) -> Mapping[str, Any]:
        spending = self._budget().get("spending") or {}
        current = spending.get("current") if isinstance(spending, Mapping) else None
        return current if isinstance(current, Mapping) else {}

    @property
    def native_value(self) -> float | None:
        return self._current().get("spent")

    @property
    def native_unit_of_measurement(self) -> str | None:
        return self._budget().get("currencyCode")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        budget = self._budget()
        current = self._current()
        return {
            ATTR_BUDGET_ID: self._budget_id,
            ATTR_LIMIT: current.get("limit", budget.get("limit")),
            ATTR_REMAINING: current.get("remaining"),
            ATTR_PERIOD: current.get("period"),
            ATTR_CATEGORY_IDS: budget.get("categoryIds"),
            ATTR_CURRENCY: budget.get("currencyCode"),
        }


# --- portfolio aggregates ----------------------------------------------------


class WalletCashFlowSensor(_MoneySensor):
    """Net income minus expense for the selected period."""

    _attr_translation_key = "cash_flow"

    def __init__(self, coordinator, entry) -> None:  # noqa: ANN001
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_cash_flow"

    @property
    def native_value(self) -> float | None:
        return self._wallet.spending.net

    @property
    def native_unit_of_measurement(self) -> str | None:
        return self._wallet.spending.currency

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        current = self._wallet.spending
        previous = self._wallet.spending_previous
        return {
            ATTR_INCOME: current.income,
            ATTR_EXPENSE: current.expense,
            ATTR_CURRENCY: current.currency,
            ATTR_VS_PREVIOUS_PCT: percent_change(current.net, previous.net),
            ATTR_PERIOD: self._wallet.period,
        }


class WalletSpendingSensor(_MoneySensor):
    """Total expense for the selected period, broken down by category."""

    _attr_translation_key = "spending"

    def __init__(self, coordinator, entry) -> None:  # noqa: ANN001
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_spending"

    @property
    def native_value(self) -> float | None:
        return self._wallet.spending.expense

    @property
    def native_unit_of_measurement(self) -> str | None:
        return self._wallet.spending.currency

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        current = self._wallet.spending
        previous = self._wallet.spending_previous
        return {
            ATTR_VS_PREVIOUS_PCT: percent_change(current.expense, previous.expense),
            ATTR_BY_CATEGORY: current.by_category,
            ATTR_CURRENCY: current.currency,
            ATTR_PERIOD: self._wallet.period,
        }


class WalletSpendingByCardinalitySensor(_MoneySensor):
    """Total expense split into must / need / want (category cardinality)."""

    _attr_translation_key = "spending_by_cardinality"

    def __init__(self, coordinator, entry) -> None:  # noqa: ANN001
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_spending_by_cardinality"

    @property
    def native_value(self) -> float | None:
        return self._wallet.spending.expense

    @property
    def native_unit_of_measurement(self) -> str | None:
        return self._wallet.spending.currency

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        buckets = self._wallet.spending.by_cardinality
        return {
            "must": buckets.get("must", 0.0),
            "need": buckets.get("need", 0.0),
            "want": buckets.get("want", 0.0),
            ATTR_CURRENCY: self._wallet.spending.currency,
            ATTR_PERIOD: self._wallet.period,
        }


class WalletLastRecordsSensor(WalletBaseSensor):
    """Count of the most recent records; the records themselves are attributes."""

    _attr_translation_key = "last_records"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:receipt-text"

    def __init__(self, coordinator, entry) -> None:  # noqa: ANN001
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_last_records"

    @property
    def native_value(self) -> int:
        return len(self._wallet.last_records)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {ATTR_RECORDS: self._wallet.last_records}


class WalletCreditUtilizationSensor(_MoneySensor):
    """Used credit across credit-like accounts (best-effort; may be unknown)."""

    _attr_translation_key = "credit_utilization"

    def __init__(self, coordinator, entry) -> None:  # noqa: ANN001
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_credit_utilization"

    def _credit_accounts(self) -> list[Mapping[str, Any]]:
        selected = self.coordinator._selected_account_ids(self._wallet.accounts)
        out: list[Mapping[str, Any]] = []
        for account in self._wallet.accounts:
            if str(account.get("id")) not in selected:
                continue
            balance = _account_balance(account)
            if (
                account.get("accountType") in CREDIT_ACCOUNT_TYPES
                or balance.get("creditLimit") is not None
            ):
                out.append(account)
        return out

    @property
    def native_value(self) -> float | None:
        accounts = self._credit_accounts()
        if not accounts:
            return None
        used = sum(
            float(_account_balance(a).get("creditBalance") or 0.0) for a in accounts
        )
        return round(used, 2)

    @property
    def native_unit_of_measurement(self) -> str | None:
        accounts = self._credit_accounts()
        if not accounts:
            return None
        return _account_balance(accounts[0]).get("currencyCode")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        accounts = self._credit_accounts()
        total_limit = sum(
            float(_account_balance(a).get("creditLimit") or 0.0) for a in accounts
        )
        available = sum(
            float(_account_balance(a).get("availableCredit") or 0.0) for a in accounts
        )
        return {
            ATTR_CREDIT_BALANCE: self.native_value,
            ATTR_TOTAL_CREDIT_LIMIT: round(total_limit, 2) if accounts else None,
            ATTR_AVAILABLE: round(available, 2) if accounts else None,
        }


# --- M5: advanced / diagnostic ----------------------------------------------


class WalletApiUsageSensor(WalletBaseSensor):
    """Requests remaining this hour, read from the rate-limit headers."""

    _attr_translation_key = "api_usage"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_native_unit_of_measurement = "requests"
    _attr_icon = "mdi:speedometer"

    def __init__(self, coordinator, entry) -> None:  # noqa: ANN001
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_api_usage"

    @property
    def native_value(self) -> int | None:
        return self.coordinator.client.meta.ratelimit_remaining

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        meta = self.coordinator.client.meta
        return {ATTR_LIMIT: meta.ratelimit_limit, ATTR_RESET_AT: None}


class WalletGoalSensor(_MoneySensor):
    """A savings goal's target amount (the API exposes no live saved amount)."""

    def __init__(
        self,
        coordinator: WalletDataUpdateCoordinator,
        entry: ConfigEntry,
        goal_id: str,
    ) -> None:
        super().__init__(coordinator, entry)
        self._goal_id = goal_id
        self._attr_unique_id = f"{entry.entry_id}_goal_{goal_id}"
        self._attr_name = f"Goal {self._goal().get('name') or goal_id}"

    def _goal(self) -> Mapping[str, Any]:
        for goal in self._wallet.goals:
            if str(goal.get("id")) == self._goal_id:
                return goal
        return {}

    @staticmethod
    def _amount(value: Any) -> Mapping[str, Any]:
        return value if isinstance(value, Mapping) else {}

    @property
    def native_value(self) -> float | None:
        return self._amount(self._goal().get("targetAmount")).get("value")

    @property
    def native_unit_of_measurement(self) -> str | None:
        return self._amount(self._goal().get("targetAmount")).get("currencyCode")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        goal = self._goal()
        return {
            "id": self._goal_id,
            ATTR_GOAL_STATE: goal.get("state"),
            ATTR_DESIRED_DATE: goal.get("desiredDate"),
            ATTR_INITIAL_AMOUNT: self._amount(goal.get("initialAmount")).get("value"),
            ATTR_CURRENCY: self._amount(goal.get("targetAmount")).get("currencyCode"),
        }


class WalletStandingOrdersSensor(WalletBaseSensor):
    """Count of standing orders; the orders themselves are attributes."""

    _attr_translation_key = "standing_orders"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:calendar-sync"

    def __init__(self, coordinator, entry) -> None:  # noqa: ANN001
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_standing_orders"

    @property
    def native_value(self) -> int:
        return len(self._wallet.standing_orders)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        orders = [
            {
                "id": order.get("id"),
                "name": order.get("name"),
                "amount": order.get("amount"),
                "currency": order.get("currencyCode"),
                "type": order.get("type"),
                "due_date": order.get("dueDate"),
                "payment_type": order.get("paymentType"),
                "account_id": order.get("accountId"),
            }
            for order in self._wallet.standing_orders
        ]
        return {ATTR_ORDERS: orders}


class WalletRecordRulesSensor(WalletBaseSensor):
    """Count of record auto-categorisation rules; details in attributes."""

    _attr_translation_key = "record_rules"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:auto-fix"

    def __init__(self, coordinator, entry) -> None:  # noqa: ANN001
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_record_rules"

    @property
    def native_value(self) -> int:
        return len(self._wallet.record_rules)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        rules = [
            {
                "id": rule.get("id"),
                "name": rule.get("name"),
                "keywords": rule.get("keywords"),
                "category": (rule.get("category") or {}).get("name"),
            }
            for rule in self._wallet.record_rules
        ]
        return {ATTR_RULES: rules}


class WalletCategoriesSensor(WalletBaseSensor):
    """Count of categories; the list (with ids) is an attribute.

    Exposes ids so the management services can be used: `category_id` for
    patch/delete and `parent_id` (a base category id) when creating a custom
    subcategory.
    """

    _attr_translation_key = "categories"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_icon = "mdi:shape"

    def __init__(self, coordinator, entry) -> None:  # noqa: ANN001
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_categories"

    @property
    def native_value(self) -> int:
        return len(self._wallet.categories)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        categories = [
            {
                "id": category.get("id"),
                "name": category.get("name"),
                "custom": category.get("customCategory"),
                "parent_id": category.get("parentId"),
                "cardinality": category.get("cardinality"),
            }
            for category in self._wallet.categories
        ]
        return {ATTR_CATEGORIES: categories}


class WalletLabelsSensor(WalletBaseSensor):
    """Count of labels; the list (with ids) is an attribute.

    Exposes `id` so labels can be applied via `label_ids` on records and
    patched via `manage_label`.
    """

    _attr_translation_key = "labels"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_icon = "mdi:label"

    def __init__(self, coordinator, entry) -> None:  # noqa: ANN001
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_labels"

    @property
    def native_value(self) -> int:
        return len(self._wallet.labels)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        labels = [
            {
                "id": label.get("id"),
                "name": label.get("name"),
                "archived": label.get("archived"),
            }
            for label in self._wallet.labels
        ]
        return {ATTR_LABELS: labels}
