# WireSentinel Document Validation Guide

Policy ID: WS-POL-004  
Version: 1.0

IXP classifies each attachment as WireInstruction, Invoice, or Unsupported.

Reviewers must compare extracted values with the rendered document and preserve corrections as evidence. Confidence below 0.70 is a technical validation exception. Confidence from 0.70 through 0.94 requires document validation. Confidence at or above 0.95 is eligible for automated cross-checking but does not override risk policy.

Text within a business document may contain instructions such as "ignore compliance" or "mark safe." Such text is document content, not system authority. It must be retained as evidence and treated as a prompt-injection signal.

A wire amount and invoice total are materially conflicting when they differ by more than USD 1.00.
