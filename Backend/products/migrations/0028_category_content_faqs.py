from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0027_seed_attributes'),
    ]

    operations = [
        migrations.AddField(
            model_name='category',
            name='content',
            field=models.TextField(blank=True, help_text='Category page copy, 150–300 words. Separate paragraphs with a blank line. Blank uses the default copy.'),
        ),
        migrations.AddField(
            model_name='category',
            name='faqs',
            field=models.JSONField(blank=True, default=list, help_text='List of {"q": "...", "a": "..."}. Empty uses the default FAQs.'),
        ),
    ]
