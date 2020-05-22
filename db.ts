import * as pg from 'pg';

// Removes accents, lowercases and only leaves a-z0-9
function NormalizeString(text: string): string
{
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export class ReleaseGroup
{
    public id: number;
    public gid: string;
    public name: string;
    public artist_credit: number;
    public type: number;

    constructor(id: number, gid: string, name: string, artist_credit: number, type: number)
    {
        this.id = id;
        this.gid = gid;
        this.name = name;
        this.artist_credit = artist_credit;
        this.type = type;
    }
}

export class Release
{
    public id: number;
    public gid: string;
    public name: string;
    public artist_credit: number;
    public release_group: number;
    public status: number;
    public country: number;
    public date: number;
    public track_count: string;

    constructor(id: number, gid: string, name: string, artist_credit: number, release_group: number, status: number, country: number, date: number, track_count: string)
    {
        this.id = id;
        this.gid = gid;
        this.name = name;
        this.artist_credit = artist_credit;
        this.release_group = release_group;
        this.status = status;
        this.country = country;
        this.date = date;
        this.track_count = track_count;
    }
}

export class Track
{
    public id: number;
    public gid: string;
    public artist_credit: number;
    public work: number;
    public recording: number;
    public release: number;
    public medium: number;
    public position: number;
    public number: string;
    public name: string;
    public is_single: boolean;

    constructor(id: number, gid: string, artist_credit: number, work: number, recording: number, release: number, medium: number, position: number, number: string, name: string)
    {
        this.id = id;
        this.gid = gid;
        this.artist_credit = artist_credit;
        this.work = work;
        this.recording = recording;
        this.release = release;
        this.medium = medium;
        this.position = position;
        this.number = number;
        this.name = name;
        this.is_single = false;
    }
}

export class ReleaseGroupSingle
{
    public id: number;
    public name: string;
    public release_group: number;

    constructor(id: number, name: string, release_group: number)
    {
        this.id = id;
        this.name = name;
        this.release_group = release_group;
    }
}

export class Album
{
    public releaseGroup: ReleaseGroup;
    public release: Release;
    public tracks: Track[] = [];
    public singles: ReleaseGroupSingle[] = [];

    constructor(releaseGroup: ReleaseGroup, release: Release)
    {
        this.releaseGroup = releaseGroup;
        this.release = release;
    }

    // If a track has this release id, let's add it
    public AddTrack = (track: Track): boolean =>
    {
        if (track.release !== this.release.id)
        {
            return false;
        }

        this.tracks.push(track);
        return true;
    }

    // Let's sort positions so the array of tracks is correctly ordered
    // We use this Intl.Collator thing because sometimes Vinyl positions are named A1, A2, B1, B2 for each side.
    public SortTracks = (): void =>
    {
        // To sort 1,2,3 and A1,A2,...,A10 correctly
        const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
        this.tracks.sort((a, b) => collator.compare(String(a.position) + a.number, String(b.position) + b.number));
    }

    // Tries it's very best to associate a release group single to a track on the album
    public SetSingles = (singles: ReleaseGroupSingle[]): number =>
    {
        for (const single of singles)
        {
            // Only interested in singles that have a relation with this album
            if (single.release_group !== this.releaseGroup.id)
            {
                continue;
            }

            this.singles.push(single);
            let foundASingle = false;
            const normalizeSingleName = NormalizeString(single.name);

            for (const track of this.tracks)
            {
                // A "single" as a release can be more than 1 song
                // so even though it's named after the single, I can't resolve
                // which song is the actual single through id's alone
                // because I also can't trust that a single is always the first song
                // in the single release.
                let isSingle = track.name === single.name;
                if (isSingle)
                {
                    track.is_single = true;
                    foundASingle = true;
                    continue;
                }

                // Gross, but nessicary, sometimes the titles of singles have different
                // accented characters from the album variant, so let's normalize both as a last ditch effort
                // Example: I’ll Stick Around and I'll Stick Around from Foo Fighters
                const normalizeTrackName = NormalizeString(track.name);
                isSingle = normalizeSingleName === normalizeTrackName;
                if (isSingle)
                {
                    track.is_single = true;
                    foundASingle = true;
                    continue;
                }

                // Really short normalized track names 
                // can clash using an includes() search, so we bail
                // Example: S&M (sm) and What's My Name? (whatsmyname)
                if (normalizeTrackName.length < 4)
                {
                    continue;
                }

                // Gross, but nessicary, example: No Way Back/Cold Day in the Sun double single
                // Which is also why we search through tracks for every single.
                isSingle = normalizeSingleName.includes(normalizeTrackName);
                if (isSingle)
                {
                    console.log(`[SINGLE][INFO] Resolved ${track.name} (${normalizeTrackName}) through 'includes' search using ${single.name} (${normalizeSingleName})`);
                    track.is_single = true;
                    foundASingle = true;
                    continue;
                }
            }

            // Examples of where this can happen.
            // Like a Virgin from Madonna has a single called "Into the Groove"
            // This song is only on the Vinyl release
            // Madonna also has a single called SEX from the album Erotica
            // no song called SEX on that album
            // Rihanna has a song called Take a Bow that is a single on Good Girl Gone Bad but only on the :Reloaded versions
            // of that album.
            // The Rolling Stones have a single called Paint It Black on the album Aftermath
            // But this is just a live cover and doesn't appear on any of the actual releases of Aftermath
            if (!foundASingle)
            {
                // Used for tracking issues, comment back in to see the no resolve madness.
                //console.log(`[SINGLE][ERROR] No track resolved for single ${single.name} in album ${this.releaseGroup.name} (${this.releaseGroup.id})`);
            }
        }

        // How many singles we got?
        let singleCount = 0;
        for (const track of this.tracks)
        {
            if (track.is_single)
            {
                singleCount += 1;
            }
        }
        return singleCount;
    }
}

export class Artist
{
    public id: number;
    public gid: string;
    public name: string;
    public artist_credits: number[] = [];
    public albums: Album[] = [];

    constructor(id: number, gid: string, name: string)
    {
        this.id = id;
        this.gid = gid;
        this.name = name;
    }

    public AddCredits = (artist_credits: number[]): void =>
    {
        this.artist_credits = artist_credits;
    }

    // Add an album to an artist
    // If the album already exists, don't do anything
    // We also sort the album list by release date after adding
    public AddAlbum = (album: Album): boolean =>
    {
        const exists = this.albums.find((a) => a.releaseGroup.id === album.releaseGroup.id);
        if (exists)
        {
            return false;
        }

        this.albums.push(album);
        this.albums.sort((a, b) => a.release.date - b.release.date);

        return true;
    }

    // Add an array of albums to an artist
    // If an album already exists, don't do anything
    // We also sort the total album list by release date after adding
    public AddAlbums = (albums: Album[]): boolean =>
    {
        for (const album of albums)
        {
            const exists = this.albums.find((a) => a.releaseGroup.id === album.releaseGroup.id);
            if (exists)
            {
                continue;
            }

            this.albums.push(album);
        }
        
        this.albums.sort((a, b) => a.release.date - b.release.date);
        return true;
    }
}

// Returns an artist based on a named text search
// This is using the postgres tsquery, which needs a specific text search 'indexes' on the table.
// Here we find all names, rank them and then sum the rank, grouped by the id of the artist
// This should give us the highest value for the artist that most closely matches the text you gave it.
export async function GetArtistSearch(client: pg.Client, name: string): Promise<Artist | null>
{
    const sortRes = await client.query(`
        SELECT names.id, names.gid, SUM(ts_rank_cd(to_tsvector('english', UPPER(name collate "en_US.utf8")), query, 2)) AS rank
        FROM
            (SELECT id, gid, name              FROM musicbrainz.artist        UNION ALL
             SELECT id, gid, sort_name AS name FROM musicbrainz.artist        UNION ALL
             SELECT artist.id, artist.gid, artist.name FROM musicbrainz.artist_alias LEFT JOIN musicbrainz.artist ON artist.id = artist_alias.artist UNION ALL
             SELECT artist.id, artist.gid, artist.sort_name AS name FROM musicbrainz.artist_alias LEFT JOIN musicbrainz.artist ON artist.id = artist_alias.artist) names,
            plainto_tsquery('english', $1) AS query
        WHERE to_tsvector('english', UPPER(name collate "en_US.utf8")) @@ query OR name = $1
        GROUP BY names.id, names.gid
        ORDER BY rank DESC;
    `, [name]);

    if (sortRes.rowCount === 0)
    {
        return null;
    }

    const res = await client.query(`
        SELECT
            *
        FROM
            musicbrainz.artist
        WHERE
            id = $1;
    `, [sortRes.rows[0].id]);

    if (res.rowCount === 0)
    {
        return null;
    }

    const row = res.rows[0];
    return new Artist(row.id, row.gid, row.name);
}

// Straight up id => Artist query
export async function GetArtistId(client: pg.Client, id: number): Promise<Artist | null>
{
    const res = await client.query(`
        SELECT
            *
        FROM
            musicbrainz.artist
        WHERE
            id = $1;
    `, [id]);

    if (res.rowCount === 0)
    {
        return null;
    }

    const row = res.rows[0];
    return new Artist(row.id, row.gid, row.name);
}

// An artist can have more than 1 credit associated to them
// We're only interested in the ones they are the main credit
// Return a list of those ids
export async function GetArtistCredits(client: pg.Client, artist_id: number): Promise<number[]>
{
    const res = await client.query(`
        SELECT
            artist_credit
        FROM
            musicbrainz.artist_credit_name
        LEFT JOIN 
            musicbrainz.artist_credit ON artist_credit.id = artist_credit_name.artist_credit
        WHERE
            artist_credit_name.artist = $1
        AND
            artist_credit_name.position = 0;
    `, [artist_id]);

    if (res.rowCount === 0)
    {
        return [];
    }

    const artistCredits = []
    for (const row of res.rows)
    {
        artistCredits.push(row.artist_credit);
    }

    return artistCredits;
}

// Give me all release groups that are albums and don't have any special
// secondary release type like compilations, etc, just straight up vanilla albums.
export async function GetReleaseGroupAlbums(client: pg.Client, artist_credits: number[]): Promise<ReleaseGroup[]>
{
    const res = await client.query(`
        SELECT
            release_group.*
        FROM
            musicbrainz.release_group
        LEFT JOIN
            musicbrainz.release_group_secondary_type_join ON release_group_secondary_type_join.release_group = release_group.id
        WHERE
            artist_credit = ANY($1::int[])
        AND
            secondary_type IS NULL
        AND
            type = 1;
    `, [artist_credits]);

    if (res.rowCount === 0)
    {
        return [];
    }

    const result = [];
    for (const row of res.rows)
    {
        result.push(new ReleaseGroup(row.id, row.gid, row.name, row.artist_credit, row.type));
    }

    return result;
}

// Give me all of the releases that have anything to do with the artist and the release groups done by the artist
// This is done in 1 query for performance reasons, but the sorting of these results and going through them
// later in the sorted order should give us the correct album.
export async function GetReleases(client: pg.Client, artist_credits: number[], release_groups: number[]): Promise<Release[]>
{
    const res = await client.query(`
        SELECT
            release.id,
            release.gid,
            release.name,
            release.artist_credit,
            release.release_group,
            release.status,
            release_country.country,
            release_country.date_year,
            release_country.date_month,
            release_country.date_day,
            medium.track_count
        FROM
            musicbrainz.release
        LEFT JOIN 
            musicbrainz.release_country ON release_country.release = release.id
        LEFT JOIN
            musicbrainz.medium ON medium.release = release.id
        WHERE
            artist_credit = ANY($1::int[])
        AND
            status = 1
        AND
            release_group = ANY($2::int[])
        ORDER BY
            date_year, date_month, date_day, medium.track_count DESC, id;
    `, [artist_credits, release_groups]);

    if (res.rowCount === 0)
    {
        return [];
    }

    // A release can have a broken date value
    // Let's just throw it to epoch so we can sort later without issue
    const releases = [];
    for (let row of res.rows)
    {
        if (!row.date_year)
        {
            row.date_year = 1970;
        }
        if (!row.date_month)
        {
            row.date_month = 1;
        }
        if (!row.date_day)
        {
            row.date_day = 1;
        }
        row.date = String(row.date_year).padStart(4, '0');
        row.date += String(row.date_month).padStart(2, '0');
        row.date += String(row.date_day).padStart(2, '0');
        row.date = parseInt(row.date);

        releases.push(new Release(
            row.id, 
            row.gid, 
            row.name, 
            row.artist_credit, 
            row.release_group, 
            row.status, 
            row.country, 
            row.date,
            row.track_count
        ));
    }

    return releases;
}

// Give me all the tracks that are associated with the release ids given, sorted by their position
export async function GetTracksFromReleases(client: pg.Client, releases: number[]): Promise<Track[]>
{
    const res = await client.query(`
        SELECT
            track.id,
            track.gid,
            track.artist_credit,
            track.recording,
            track.medium,
            track.number,
            track.name,
            medium.release,
            medium.position,
            l_recording_work.entity1 as work
        FROM
            musicbrainz.track
        LEFT JOIN 
            musicbrainz.medium ON medium.id = track.medium
        LEFT JOIN 
            musicbrainz.l_recording_work ON l_recording_work.entity0 = track.recording
        WHERE
            medium.release = ANY($1::int[])
        ORDER BY
            medium.position, track.number::bytea;
    `, [releases]);

    if (res.rowCount === 0)
    {
        return [];
    }

    const result = [];
    for (const row of res.rows)
    {
        result.push(new Track(
            row.id, 
            row.gid, 
            row.artist_credit, 
            row.work,
            row.recording, 
            row.release, 
            row.medium, 
            row.position, 
            row.number, 
            row.name)
        );
    }

    return result;
}

// Get me all single release groups associated with the artist and the album release groups they have done
export async function GetSinglesAlbumRelation(client: pg.Client, artist_credits: number[], release_groups: number[]): Promise<ReleaseGroupSingle[]>
{
    const res = await client.query(`
        SELECT
            release_group.id,
            release_group.name,
            l_release_group_release_group.entity1 as release_group
        FROM
            musicbrainz.l_release_group_release_group
        LEFT JOIN
            musicbrainz.release_group ON release_group.id = l_release_group_release_group.entity0
        WHERE
            entity1 = ANY($1::int[])
        AND
            release_group.artist_credit = ANY($2::int[])
        AND 
            (release_group.type = 2
             OR release_group.type = 3);
    `, [release_groups, artist_credits]);

    if (res.rowCount === 0)
    {
        return [];
    }

    const singles = [];
    for (const row of res.rows)
    {
        singles.push(new ReleaseGroupSingle(row.id, row.name, row.release_group));
    }

    return singles;
}

// Scatch pad
export async function GetTest(client: pg.Client): Promise<void>
{
    const res = await client.query(`
        SELECT names.id, names.gid, SUM(ts_rank_cd(to_tsvector('english', UPPER(name collate "en_US.utf8")), query, 2)) AS rank
        FROM
            (SELECT id, gid, name              FROM musicbrainz.artist        UNION ALL
             SELECT id, gid, sort_name AS name FROM musicbrainz.artist        UNION ALL
             SELECT artist.id, artist.gid, artist.name FROM musicbrainz.artist_alias LEFT JOIN musicbrainz.artist ON artist.id = artist_alias.artist UNION ALL
             SELECT artist.id, artist.gid, artist.sort_name AS name FROM musicbrainz.artist_alias LEFT JOIN musicbrainz.artist ON artist.id = artist_alias.artist) names,
            plainto_tsquery('english', UPPER($1)) AS query
        WHERE to_tsvector('english', UPPER(name collate "en_US.utf8")) @@ query OR name = $1
        GROUP BY names.id, names.gid
        ORDER BY rank DESC;
    `, ['Tom Jones']);

    console.log(res.rows);
}