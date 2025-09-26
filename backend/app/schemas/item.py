from marshmallow import Schema, fields


class ItemSchema(Schema):
    id = fields.Int(dump_only=True)
    title = fields.Str(required=True)
    description = fields.Str()
    type = fields.Str(required=True)
    location = fields.Str()
    date_reported = fields.DateTime(dump_only=True)
    photo_url = fields.Str()
    owner_id = fields.Int(allow_none=True)
    status = fields.Str(dump_only=True)
