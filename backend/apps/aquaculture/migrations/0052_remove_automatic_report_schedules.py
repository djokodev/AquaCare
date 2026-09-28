from __future__ import annotations

from django.db import migrations


AUTOMATIC_REPORT_TASK_PATHS = {
    'aquaculture.tasks.generate_daily_report_drafts_task',
    'aquaculture.tasks.generate_weekly_report_drafts_task',
    'aquaculture.tasks.generate_monthly_report_drafts_task',
}


def remove_automatic_report_schedules(apps, schema_editor):
    """
    Supprime les tâches périodiques de génération automatique des brouillons.

    Direction A: les rapports sont créés uniquement à la demande (app mobile
    ou administration). django_celery_beat persiste le beat_schedule initial
    dans la base, donc retirer les entrées de celery.py ne suffit pas pour
    les environnements déjà déployés (staging/prod).
    """
    try:
        PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
        CrontabSchedule = apps.get_model('django_celery_beat', 'CrontabSchedule')
    except LookupError:
        # django_celery_beat n'est pas installé dans cette configuration
        # (profile de tests SQLite sans migrations): rien à faire.
        return

    removed = PeriodicTask.objects.filter(task__in=AUTOMATIC_REPORT_TASK_PATHS)
    crontab_ids = {
        crontab_id
        for crontab_id in removed.values_list('crontab_id', flat=True)
        if crontab_id is not None
    }
    removed.delete()

    if crontab_ids:
        # Ne supprime que les crontabs devenus orphelins par ce retrait.
        orphan_crontabs = CrontabSchedule.objects.filter(
            id__in=crontab_ids,
            periodictask__isnull=True,
        )
        orphan_crontabs.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0051_validate_ongoing_baseline_not_null'),
        ('django_celery_beat', '0019_alter_periodictasks_options'),
    ]

    operations = [
        migrations.RunPython(remove_automatic_report_schedules, migrations.RunPython.noop),
    ]
