class ICS {
    static generate(title, description, startStr, durationMinutes = 60) {
        const formatDate = (date) => {
            if (!(date instanceof Date) || isNaN(date)) return '';
            return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };

        const startDate = new Date(startStr);
        if (isNaN(startDate)) {
            console.error('Invalid date for ICS generation:', startStr);
            return '';
        }

        const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

        const now = formatDate(new Date());
        const start = formatDate(startDate);
        const end = formatDate(endDate);

        // Simple escaping for ICS format
        const cleanDesc = description ? description.replace(/\n/g, '\\n').replace(/,/g, '\\,') : '';
        const cleanTitle = title ? title.replace(/,/g, '\\,') : 'CRM Event';

        const event = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//MyCRM//MyCRM//EN',
            'BEGIN:VEVENT',
            `UID:${Date.now()}@mycrm.com`,
            `DTSTAMP:${now}`,
            `DTSTART:${start}`,
            `DTEND:${end}`,
            `SUMMARY:${cleanTitle}`,
            `DESCRIPTION:${cleanDesc}`,
            // Reminder alarm - triggers 15 minutes before
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            `DESCRIPTION:Reminder: ${cleanTitle}`,
            'TRIGGER:-PT15M',
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        return event;
    }

    static download(title, description, startStr) {
        const data = this.generate(title, description, startStr);
        if (!data) {
            alert('Error generating calendar file. Invalid date.');
            return;
        }

        const blob = new Blob([data], { type: 'text/calendar;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'event.ics';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
}
