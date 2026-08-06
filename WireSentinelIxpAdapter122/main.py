from __future__ import annotations

import json
import os
import re
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

from uipath.core.tracing import traced
from uipath.platform import UiPath
from uipath.platform.attachments import Attachment
from uipath.platform.common import UiPathConfig
from uipath.platform.documents import ProjectType


IXP_PROJECT_NAME = "WireSentinel Documents"
IXP_PROJECT_TAG = "live"


@dataclass
class Input:
    wire_file: Attachment
    supporting_file: Attachment | None = None


@dataclass
class Output:
    content: str = ""
    error_type: str = ""
    error_message: str = ""


def _coerce_attachment(value: Attachment | dict[str, Any]) -> Attachment:
    if isinstance(value, Attachment):
        return value
    return Attachment.model_validate(value)


@contextmanager
def _attachment_path(
    client: UiPath,
    attachment: Attachment,
    local_env: str,
) -> Iterator[Path]:
    if UiPathConfig.job_key is None:
        local_path = os.environ.get(local_env, "")
        if not local_path:
            raise ValueError(f"{local_env} is required for a local run")
        yield Path(local_path)
        return

    with client.attachments.open(attachment=attachment) as (_metadata, response):
        raw_bytes = response.read()

    safe_name = Path(attachment.full_name).name or "document.pdf"
    with tempfile.TemporaryDirectory(prefix="wiresentinel-ixp-") as temp_dir:
        local_path = Path(temp_dir, safe_name)
        local_path.write_bytes(raw_bytes)
        yield local_path


def _as_jsonable(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json", by_alias=True)
    if isinstance(value, dict):
        return {str(key): _as_jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_as_jsonable(item) for item in value]
    return value


def _normalise_name(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _money(value: Any) -> tuple[float, str]:
    text = str(value or "").strip()
    match = re.search(r"-?[0-9][0-9,]*(?:\.[0-9]+)?", text)
    amount = float(match.group(0).replace(",", "")) if match else 0.0
    currency_match = re.search(r"\b[A-Z]{3}\b", text.upper())
    return amount, currency_match.group(0) if currency_match else "USD"


def _field_groups(ixp_result: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for projection in ixp_result.get("dataProjection") or []:
        group_name = str(projection.get("fieldGroupName") or "")
        groups[group_name] = list(projection.get("fieldValues") or [])
    return groups


def _field_map(values: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        str(item.get("name") or item.get("id") or ""): item
        for item in values
        if isinstance(item, dict)
    }


def _field_value(fields: dict[str, dict[str, Any]], name: str) -> Any:
    return (fields.get(name) or {}).get("value")


def _confidence(values: list[dict[str, Any]]) -> float:
    scores = [
        float(item.get("confidence"))
        for item in values
        if item.get("confidence") is not None
    ]
    return round(sum(scores) / len(scores), 6) if scores else 0.0


def _normalise_document(
    *,
    file_name: str,
    role: str,
    extraction: Any,
) -> dict[str, Any]:
    ixp_result = _as_jsonable(extraction)
    groups = _field_groups(ixp_result)
    classification_values = groups.get("Document Classification", [])
    classification_fields = _field_map(classification_values)
    document_type = str(
        _field_value(classification_fields, "Document Type") or "Unsupported"
    )
    supported = document_type in {"WireInstruction", "Invoice"}
    extracted_fields: dict[str, Any] = {}
    target_values = groups.get(document_type, [])
    target_fields = _field_map(target_values)

    if document_type == "WireInstruction":
        amount, currency = _money(_field_value(target_fields, "Amount"))
        extracted_fields = {
            "request_id": _field_value(target_fields, "Request ID") or "",
            "customer_id": _field_value(target_fields, "Customer ID") or "",
            "debit_account": _field_value(target_fields, "Debit Account") or "",
            "transfer_type": _field_value(target_fields, "Transfer Type") or "",
            "amount": amount,
            "currency": currency,
            "beneficiary_name": _field_value(target_fields, "Beneficiary") or "",
            "beneficiary_bank": _field_value(target_fields, "Beneficiary Bank") or "",
            "beneficiary_country": _field_value(
                target_fields,
                "Beneficiary Country",
            )
            or "",
            "routing_or_swift": _field_value(target_fields, "Routing/SWIFT") or "",
            "purpose": _field_value(target_fields, "Purpose") or "",
            "requested_execution_date": _field_value(
                target_fields,
                "Requested Execution Date",
            )
            or "",
            "authorized_approver": _field_value(
                target_fields,
                "Authorized Approver",
            )
            or "",
            "signature_present": str(
                _field_value(target_fields, "Signature Present") or ""
            ).lower()
            in {"yes", "true", "present"},
        }
    elif document_type == "Invoice":
        invoice_total, currency = _money(
            _field_value(target_fields, "Invoice Total")
        )
        line_values = groups.get("Invoice > Line Items", [])
        line_fields = _field_map(line_values)
        quantity_text = str(_field_value(line_fields, "Quantity") or "")
        unit_price, _ = _money(_field_value(line_fields, "Unit Price"))
        line_total, _ = _money(_field_value(line_fields, "Line Total"))
        extracted_fields = {
            "invoice_number": _field_value(target_fields, "Invoice Number") or "",
            "supplier": _field_value(target_fields, "Supplier") or "",
            "supplier_country": _field_value(target_fields, "Supplier Country")
            or "",
            "invoice_date": _field_value(target_fields, "Invoice Date") or "",
            "due_date": _field_value(target_fields, "Due Date") or "",
            "purchase_order": _field_value(target_fields, "Purchase Order") or "",
            "beneficiary_account_last_four_digits": _field_value(
                target_fields,
                "Beneficiary Account Last Four Digits",
            )
            or "",
            "invoice_total": invoice_total,
            "total_amount": invoice_total,
            "currency": currency,
            "line_items": [
                {
                    "description": _field_value(line_fields, "Description") or "",
                    "quantity": float(quantity_text) if quantity_text else 0.0,
                    "unit_price": unit_price,
                    "line_total": line_total,
                }
            ]
            if line_values
            else [],
        }

    confidence_by_field = {
        name: round(float(item.get("confidence") or 0.0), 6)
        for name, item in target_fields.items()
    }
    classification_confidence = _confidence(classification_values)
    extraction_confidence = _confidence(target_values)
    return {
        "file_name": file_name,
        "source_role": role,
        "document_type": (
            "wire_instruction"
            if document_type == "WireInstruction"
            else document_type.lower()
        ),
        "classification_confidence": classification_confidence,
        "extraction_confidence": extraction_confidence,
        "supported": supported,
        "quarantine_reason": "" if supported else "Unsupported document type",
        "extracted_fields": extracted_fields,
        "ixp_metadata": {
            "project_id": ixp_result.get("projectId"),
            "tag": ixp_result.get("tag"),
            "document_type_id": ixp_result.get("documentTypeId"),
            "field_confidence": confidence_by_field,
        },
    }


def _evidence_pack(documents: list[dict[str, Any]]) -> dict[str, Any]:
    wire_docs = [
        doc for doc in documents if doc.get("document_type") == "wire_instruction"
    ]
    invoice_docs = [
        doc for doc in documents if doc.get("document_type") == "invoice"
    ]
    wire = (
        dict(wire_docs[0].get("extracted_fields") or {})
        if len(wire_docs) == 1
        else None
    )
    invoice = (
        dict(invoice_docs[0].get("extracted_fields") or {})
        if invoice_docs
        else None
    )
    required = (
        {
            "request_id": wire.get("request_id"),
            "customer_id": wire.get("customer_id"),
            "amount": wire.get("amount"),
            "beneficiary_name": wire.get("beneficiary_name"),
            "beneficiary_country": wire.get("beneficiary_country"),
            "routing_or_swift": wire.get("routing_or_swift"),
            "signature_present": wire.get("signature_present"),
        }
        if wire
        else {}
    )
    missing_required = [
        name
        for name, value in required.items()
        if value in (None, "", False, 0, 0.0)
    ]
    amount_match = (
        bool(wire and invoice)
        and float(wire.get("amount") or 0.0) > 0
        and float(invoice.get("invoice_total") or 0.0) > 0
        and abs(
            float(wire.get("amount") or 0.0)
            - float(invoice.get("invoice_total") or 0.0)
        )
        / max(
            float(wire.get("amount") or 0.0),
            float(invoice.get("invoice_total") or 0.0),
        )
        <= 0.01
    )
    beneficiary_match = (
        bool(wire and invoice)
        and _normalise_name(wire.get("beneficiary_name"))
        == _normalise_name(invoice.get("supplier"))
    )
    country_match = (
        bool(wire and invoice)
        and _normalise_name(wire.get("beneficiary_country"))
        == _normalise_name(invoice.get("supplier_country"))
    )
    unsupported = any(not doc.get("supported", False) for doc in documents)
    complete = len(wire_docs) == 1 and not missing_required and not unsupported
    status = "complete" if complete else ("partial" if documents else "failed")
    signals: list[str] = []
    if invoice and not amount_match:
        signals.append("DOCUMENT_AMOUNT_MISMATCH")
    if invoice and not beneficiary_match:
        signals.append("DOCUMENT_BENEFICIARY_MISMATCH")
    if invoice and not country_match:
        signals.append("DOCUMENT_COUNTRY_MISMATCH")
    if missing_required:
        signals.append("MISSING_REQUIRED_FIELDS")
    if unsupported:
        signals.append("UNSUPPORTED_DOCUMENT")

    return {
        "project_name": IXP_PROJECT_NAME,
        "tag": IXP_PROJECT_TAG,
        "documents": documents,
        "wire_instruction": wire,
        "supporting_invoice": invoice,
        "consistency": {
            "amount_match": amount_match,
            "beneficiary_match": beneficiary_match,
            "country_match": country_match,
        },
        "preliminary_risk": {
            "suggested_level": "Low" if not signals else "Medium",
            "signals": signals,
            "rationale": (
                "IXP evidence is complete and cross-document values agree."
                if not signals
                else "IXP evidence requires deterministic policy review."
            ),
        },
        "missing_required_fields": missing_required,
        "extraction_status": status,
    }


@traced(name="wiresentinel_ixp_extract", run_type="uipath")
def main(input: Input) -> Output:
    output = Output()

    try:
        client = UiPath()
        documents: list[dict[str, Any]] = []
        wire_attachment = _coerce_attachment(input.wire_file)

        with _attachment_path(
            client,
            wire_attachment,
            "UIPATH_LOCAL_WIRE_PATH",
        ) as wire_path:
            wire_result = client.documents.extract(
                project_name=IXP_PROJECT_NAME,
                tag=IXP_PROJECT_TAG,
                file_path=str(wire_path),
                project_type=ProjectType.IXP,
            )
        documents.append(
            _normalise_document(
                file_name=wire_attachment.full_name,
                role="wire",
                extraction=wire_result,
            )
        )

        if input.supporting_file is not None:
            supporting_attachment = _coerce_attachment(input.supporting_file)
            with _attachment_path(
                client,
                supporting_attachment,
                "UIPATH_LOCAL_SUPPORTING_PATH",
            ) as supporting_path:
                supporting_result = client.documents.extract(
                    project_name=IXP_PROJECT_NAME,
                    tag=IXP_PROJECT_TAG,
                    file_path=str(supporting_path),
                    project_type=ProjectType.IXP,
                )
            documents.append(
                _normalise_document(
                    file_name=supporting_attachment.full_name,
                    role="supporting",
                    extraction=supporting_result,
                )
            )

        output.content = json.dumps(_evidence_pack(documents), separators=(",", ":"))
    except Exception as exc:
        output.error_type = type(exc).__name__
        output.error_message = str(exc)
        output.content = json.dumps(
            {
                "project_name": IXP_PROJECT_NAME,
                "tag": IXP_PROJECT_TAG,
                "documents": [],
                "extraction_status": "failed",
                "error_type": output.error_type,
                "error_message": output.error_message,
            },
            separators=(",", ":"),
        )

    return output
