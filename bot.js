require('dotenv').config();
const { Client, GatewayIntentBits, Events, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Generează cheie random W3ST-XXXX-XXXX-XXXX
function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment = () => Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `W3ST-${segment()}-${segment()}-${segment()}`;
}

// Comenzi Slash
const commands = [
    new SlashCommandBuilder()
        .setName('generate')
        .setDescription('Generează o cheie de licență W3ST')
        .addIntegerOption(option => 
            option.setName('days')
                .setDescription('Număr de zile (default: 30)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(365))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
        .setName('keys')
        .setDescription('Vezi toate cheile generate')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
        .setName('revoke')
        .setDescription('Revocă o cheie')
        .addStringOption(option => 
            option.setName('key')
                .setDescription('Cheia de revocat')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

// Deploy commands (rulează o singură dată)
client.once(Events.ClientReady, async () => {
    console.log(`Bot logat ca ${client.user.tag}`);
    
    try {
        await client.application.commands.set(commands);
        console.log('Comenzi înregistrate!');
    } catch (error) {
        console.error('Eroare la înregistrarea comenzilor:', error);
    }
});

// Handler comenzi
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

// /generate
if (interaction.commandName === 'generate') {
    // Verificare după ROL ID
    const ALLOWED_ROLE_ID = '1474504134656004199';
    
    // Verifică dacă suntem în guild (server)
    if (!interaction.guild) {
        return interaction.reply({ 
            content: '❌ Comanda poate fi folosită doar pe server!', 
            ephemeral: true 
        });
    }
    
    // Fetch member cu rolurile
    let member;
    try {
        member = await interaction.guild.members.fetch(interaction.user.id);
    } catch (err) {
        console.error('Eroare fetch member:', err);
        return interaction.reply({ 
            content: '❌ Eroare la verificarea rolului!', 
            ephemeral: true 
        });
    }
    
    // Verifică rolul
    const hasRole = member.roles.cache.has(ALLOWED_ROLE_ID);
    
    console.log('User:', interaction.user.tag);
    console.log('User roles:', member.roles.cache.map(r => r.name).join(', '));
    console.log('Looking for role ID:', ALLOWED_ROLE_ID);
    console.log('Has role:', hasRole);
    
    if (!hasRole) {
        return interaction.reply({ 
            content: '❌ Nu ai rolul necesar pentru a genera chei!', 
            ephemeral: true 
        });
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    const days = interaction.options.getInteger('days') || 30;
    const key = generateKey();
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    console.log('Generating key:', key);

    const { error } = await supabase
        .from('license_keys')
        .insert({
            key: key,
            duration_days: days,
            expires_at: expiresAt.toISOString(),
            created_by: interaction.user.id
        });

    if (error) {
        console.error('❌ Supabase error:', error);
        return interaction.editReply({ 
            content: `❌ Eroare la salvare: ${error.message}` 
        });
    }

    const embed = {
        color: 0xDC2626,
        title: '🔑 Cheie Generată cu Succes',
        fields: [
            { name: 'Cheie', value: `\`\`\`${key}\`\`\``, inline: false },
            { name: 'Durată', value: `${days} zile`, inline: true },
            { name: 'Expiră la', value: `<t:${Math.floor(expiresAt.getTime()/1000)}:D>`, inline: true }
        ],
        footer: { text: `Generată de ${interaction.user.tag}` },
        timestamp: new Date().toISOString()
    };

    await interaction.editReply({ embeds: [embed] });
    
    try {
        const logChannel = interaction.guild.channels.cache.find(c => c.name === 'license-logs');
        if (logChannel) {
            await logChannel.send({
                embeds: [{
                    color: 0x22C55E,
                    description: `✅ **${interaction.user.tag}** a generat o cheie de **${days} zile**`
                }]
            });
        }
    } catch (e) {}
}
    
    // /keys
    if (interaction.commandName === 'keys') {
        await interaction.deferReply({ ephemeral: true });
        
        const { data: keys, error } = await supabase
            .from('license_keys')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        if (error || !keys.length) {
            return interaction.editReply('Nu există chei sau a apărut o eroare.');
        }

        const list = keys.map(k => {
            const status = k.used ? '🔴 Folosită' : '🟢 Liberă';
            return `\`${k.key}\` - ${k.duration_days}z - ${status}`;
        }).join('\n');

        await interaction.editReply({
            embeds: [{
                color: 0x3B82F6,
                title: '📋 Ultimele 10 chei',
                description: list,
                timestamp: new Date()
            }]
        });
    }

    // /revoke
    if (interaction.commandName === 'revoke') {
        const key = interaction.options.getString('key').toUpperCase();
        
        const { error } = await supabase
            .from('license_keys')
            .delete()
            .eq('key', key);

        if (error) {
            return interaction.reply({ content: '❌ Eroare la ștergere!', ephemeral: true });
        }

        await interaction.reply({ 
            content: `✅ Cheia \`${key}\` a fost revocată!`, 
            ephemeral: true 
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
