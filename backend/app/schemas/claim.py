from marshmallow import Schema, fields


class ClaimSchema(Schema):
    id = fields.Int(dump_only=True)
    item_id = fields.Int(required=True)
    claimant_id = fields.Int(required=True)
    status = fields.Str(dump_only=True)
    created_at = fields.DateTime(dump_only=True)
